import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { contentVersion, fileExists, readTextIfFile, removeIfUnchanged, replacePrefixAtomic, writeFileAtomic } from "./fs-utils";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

async function onWindows<T>(action: () => Promise<T>): Promise<T> {
  const platform = process.platform;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    return await action();
  } finally {
    Object.defineProperty(process, "platform", { value: platform });
  }
}

describe("readTextIfFile и fileExists", () => {
  it("каталог и путь сквозь файл — файла нет, а не ошибка: source задачи бывает каталогом или опечаткой", async () => {
    const dir = await makeTempDir();
    await writeFiles(dir, { "src/a.ts": "a\n" });

    expect(await readTextIfFile(join(dir, "src"))).toBeNull();
    expect(await readTextIfFile(join(dir, "src/a.ts/b.ts"))).toBeNull();
    expect(await fileExists(join(dir, "src/a.ts/b.ts"))).toBe(false);
    expect(await fileExists(join(dir, "src"))).toBe(true);
  });
});

describe("removeIfUnchanged", () => {
  it("удаляет файл, только если его содержимое не менялось; уже удалённый другим процессом файл не выдаёт за своё удаление", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "same.md": "было\n", "changed.md": "было\n", "gone.md": "было\n" });
    await writeFile(join(root, "changed.md"), "стало\n");
    await rm(join(root, "gone.md"));
    const version = contentVersion("было\n");

    expect(await removeIfUnchanged(join(root, "same.md"), version)).toBe("removed");
    expect(await removeIfUnchanged(join(root, "changed.md"), version)).toBe("changed");
    expect(await removeIfUnchanged(join(root, "gone.md"), version)).toBe("already-gone");

    await expect(readFile(join(root, "same.md"))).rejects.toThrow(/ENOENT/);
    expect(await readFile(join(root, "changed.md"), "utf8")).toBe("стало\n");
  });
});

const LOCK_HELD_MS = 200;

describe("writeFileAtomic", () => {
  it.runIf(process.platform === "win32")("на Windows дожидается, пока другой процесс отпустит файл, и записывает его", async () => {
    const root = await makeTempDir();
    const path = join(root, "task.md");
    await writeFile(path, "было\n");
    const script = `$f = [System.IO.File]::Open('${path.replaceAll("'", "''")}', 'Open', 'Read', 'None'); [Console]::Out.WriteLine('locked'); [void][Console]::In.ReadLine(); $f.Close()`;
    const holder = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
    const released = once(holder, "exit");
    try {
      await once(holder.stdout, "data");
      let written = false;
      const writing = writeFileAtomic(path, "стало\n").then(() => {
        written = true;
      });
      await sleep(LOCK_HELD_MS);
      const writtenWhileLocked = written;
      holder.stdin.end("release\n");
      await writing;

      expect(writtenWhileLocked).toBe(false);
      expect(await readFile(path, "utf8")).toBe("стало\n");
    } finally {
      holder.stdin.end();
      await released;
    }
  });
});

describe("replacePrefixAtomic", () => {
  it("на Windows строки, дописанные, пока занятый файл не даёт себя заменить, попадают в новый файл", async () => {
    const path = join(await makeTempDir(), "journal.jsonl");
    await writeFile(path, "old\nkept\n");
    const read = await readFile(path);
    vi.mocked(rename).mockImplementationOnce(async () => {
      await appendFile(path, "late\n");
      throw Object.assign(new Error("busy"), { code: "EBUSY" });
    });

    await onWindows(() => replacePrefixAtomic(path, read, "kept\n"));

    expect(await readFile(path, "utf8")).toBe("kept\nlate\n");
  });

  it("файл, который за это время заменили другим, а не дописали, остаётся как есть", async () => {
    const path = join(await makeTempDir(), "journal.jsonl");
    await writeFile(path, "old\nkept\n");
    const read = await readFile(path);
    await writeFile(path, "other\nlonger file\n");

    const replaced = await replacePrefixAtomic(path, read, "kept\n");

    expect(await readFile(path, "utf8")).toBe("other\nlonger file\n");
    expect(replaced).toBe(false);
  });
});
