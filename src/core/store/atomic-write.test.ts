import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { replacePrefixAtomic, writeFileAtomic } from "./atomic-write";
import { failingOnce } from "./testing/fs-failures";
import { asIfOnWindows } from "./testing/platform";
import { makeTempDir } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) };
});

const LOCK_HELD_MS = 200;

describe("writeFileAtomic", () => {
  it.skipIf(process.platform === "win32")("на файловой системе, где каталог нельзя синхронизировать, запись проходит и не сообщает о сбое (на Windows каталог не синхронизируют вовсе)", async () => {
    const path = join(await makeTempDir(), "task.md");
    await failingOnce(
      open,
      (target) => target === dirname(path),
      () => writeFileAtomic(path, "стало\n", { onErrorAfterPublish: failOnPathError }),
      { code: "EINVAL" },
    );

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
      const writing = writeFileAtomic(path, "стало\n", { onErrorAfterPublish: failOnPathError }).then(() => {
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

    await asIfOnWindows(() => replacePrefixAtomic(path, read, "kept\n", { onErrorAfterPublish: failOnPathError }));

    expect(await readFile(path, "utf8")).toBe("kept\nlate\n");
  });

  it("на Windows строки, дописанные до вызова, попадают в новый файл один раз, сколько бы раз ни повторялась замена", async () => {
    const path = join(await makeTempDir(), "journal.jsonl");
    await writeFile(path, "old\nkept\n");
    const read = await readFile(path);
    await appendFile(path, "late\n");
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EBUSY" }));

    await asIfOnWindows(() => replacePrefixAtomic(path, read, "kept\n", { onErrorAfterPublish: failOnPathError }));

    expect(await readFile(path, "utf8")).toBe("kept\nlate\n");
  });

  it("файл, который за это время заменили другим, а не дописали, остаётся как есть", async () => {
    const path = join(await makeTempDir(), "journal.jsonl");
    await writeFile(path, "old\nkept\n");
    const read = await readFile(path);
    await writeFile(path, "other\nlonger file\n");

    const replaced = await replacePrefixAtomic(path, read, "kept\n", { onErrorAfterPublish: failOnPathError });

    expect(await readFile(path, "utf8")).toBe("other\nlonger file\n");
    expect(replaced).toBe(false);
  });
});
