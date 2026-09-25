import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { contentVersion, removeIfUnchanged, writeFileAtomic } from "./fs-utils";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";

describe("removeIfUnchanged", () => {
  it("удаляет файл, только если его содержимое не менялось с ожидаемой версии", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "same.md": "было\n", "changed.md": "было\n", "gone.md": "было\n" });
    await writeFile(join(root, "changed.md"), "стало\n");
    await rm(join(root, "gone.md"));
    const version = contentVersion("было\n");

    expect(await removeIfUnchanged(join(root, "same.md"), version)).toBe(true);
    expect(await removeIfUnchanged(join(root, "changed.md"), version)).toBe(false);
    expect(await removeIfUnchanged(join(root, "gone.md"), version)).toBe(true);

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
