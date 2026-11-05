import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { replacePrefixAtomic, writeFileAtomic } from "./atomic-write";
import { makeTempDir } from "./testing/temp-dirs";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) };
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

const LOCK_HELD_MS = 200;

describe("writeFileAtomic", () => {
  it("на файловой системе, где каталог нельзя синхронизировать, запись проходит и не сообщает о сбое", async () => {
    const path = join(await makeTempDir(), "task.md");
    const { open: actualOpen } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(open).mockImplementation(async (target, ...rest) => {
      if (target === dirname(path)) throw Object.assign(new Error("not supported"), { code: "EINVAL" });
      return actualOpen(target, ...rest);
    });

    try {
      await writeFileAtomic(path, "стало\n");
    } finally {
      vi.mocked(open).mockImplementation(actualOpen);
    }

    expect(await readFile(path, "utf8")).toBe("стало\n");
  });

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

  it("на Windows строки, дописанные до вызова, попадают в новый файл один раз, сколько бы раз ни повторялась замена", async () => {
    const path = join(await makeTempDir(), "journal.jsonl");
    await writeFile(path, "old\nkept\n");
    const read = await readFile(path);
    await appendFile(path, "late\n");
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EBUSY" }));

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
