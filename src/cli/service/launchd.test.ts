import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import type { CliEnv } from "../io";
import { fakeExec } from "../testing/cli-harness";
import { launchdManager, launchdPlist } from "./launchd";
import type { ServiceContext } from "./service";

function contextFor(home: string, exec: CliEnv["exec"] = fakeExec().exec): ServiceContext {
  return {
    home,
    env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
    backlogRoot: join(home, "backlog"),
    port: 4400,
    nodePath: "/opt/node/bin/node",
    cliPath: "/opt/p-backlog/dist/cli.js",
    exec,
    uid: 501,
  };
}

const plistPath = (home: string) => join(home, "Library/LaunchAgents/local.p-backlog.plist");

describe("launchdPlist", () => {
  it("запускает serve собранного cli.js с окружением на момент установки и пишет лог в ~/Library/Logs", () => {
    const home = "/Users/ann";
    const plist = launchdPlist(contextFor(home));

    expect(plist).toContain("<key>Label</key>\n  <string>local.p-backlog</string>");
    expect(plist).toContain(
      "<key>ProgramArguments</key>\n  <array>\n    <string>/opt/node/bin/node</string>\n    <string>/opt/p-backlog/dist/cli.js</string>\n    <string>serve</string>\n  </array>",
    );
    expect(plist).toContain("<key>BACKLOG_DIR</key>\n    <string>/Users/ann/backlog</string>");
    expect(plist).toContain("<key>PORT</key>\n    <string>4400</string>");
    expect(plist).toContain("<key>PATH</key>\n    <string>/usr/local/bin:/usr/bin:/bin</string>");
    expect(plist).toContain("<key>HOME</key>\n    <string>/Users/ann</string>");
    expect(plist).toContain("<key>StandardOutPath</key>\n  <string>/Users/ann/Library/Logs/p-backlog.log</string>");
    expect(plist).toContain("<key>StandardErrorPath</key>\n  <string>/Users/ann/Library/Logs/p-backlog.log</string>");
  });

  it("экранирует спецсимволы XML в путях", () => {
    const plist = launchdPlist({ ...contextFor("/Users/ann"), cliPath: `/opt/R&D/<"p-backlog">/cli.js` });

    expect(plist).toContain("<string>/opt/R&amp;D/&lt;&quot;p-backlog&quot;&gt;/cli.js</string>");
  });
});

describe("launchdManager", () => {
  it("install выгружает прежний агент, пишет plist и загружает его; ошибка bootout отказом не считается", async () => {
    const home = await makeTempDir();
    let plistAtBootstrap = "";
    const fake = fakeExec(async (command) => {
      if (command.startsWith("launchctl bootout")) return { code: 3, output: "Boot-out failed: 3: No such process" };
      if (command.startsWith("launchctl bootstrap")) plistAtBootstrap = await readFile(plistPath(home), "utf8");
      return { code: 0, output: "" };
    });
    const context = contextFor(home, fake.exec);

    const outcome = await launchdManager(context).install();

    expect(outcome).toBe("done");
    expect(fake.calls).toEqual(["launchctl bootout gui/501/local.p-backlog", `launchctl bootstrap gui/501 ${plistPath(home)}`]);
    expect(plistAtBootstrap).toBe(launchdPlist(context));
  });

  it("install поверх старого агента перезаписывает plist", async () => {
    const home = await makeTempDir();
    await mkdir(dirname(plistPath(home)), { recursive: true });
    await writeFile(plistPath(home), "<plist>из клона</plist>");
    const context = contextFor(home);

    expect(await launchdManager(context).install()).toBe("done");
    expect(await readFile(plistPath(home), "utf8")).toBe(launchdPlist(context));
  });

  it("отказ bootstrap возвращает вывод и код launchctl, plist остаётся для разбора", async () => {
    const home = await makeTempDir();
    const fake = fakeExec((command) =>
      command.startsWith("launchctl bootstrap") ? { code: 5, output: "Bootstrap failed: 5: Input/output error" } : { code: 0, output: "" },
    );

    const outcome = await launchdManager(contextFor(home, fake.exec)).install();

    expect(outcome).toEqual({ failed: "launchctl bootstrap", code: 5, output: "Bootstrap failed: 5: Input/output error" });
    await expect(readFile(plistPath(home), "utf8")).resolves.toContain("local.p-backlog");
  });

  it("uninstall без plist сообщает, что агента нет, и launchctl не зовёт", async () => {
    const home = await makeTempDir();
    const fake = fakeExec();

    expect(await launchdManager(contextFor(home, fake.exec)).uninstall()).toBe("absent");
    expect(fake.calls).toEqual([]);
  });

  it("uninstall выгружает агент и удаляет plist", async () => {
    const home = await makeTempDir();
    const fake = fakeExec();
    const manager = launchdManager(contextFor(home, fake.exec));
    await manager.install();
    fake.calls.length = 0;

    expect(await manager.uninstall()).toBe("done");
    expect(fake.calls).toEqual(["launchctl bootout gui/501/local.p-backlog"]);
    await expect(readFile(plistPath(home), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
