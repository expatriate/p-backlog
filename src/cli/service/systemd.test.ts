import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import type { CliEnv } from "../io";
import { fakeExec } from "../testing/cli-harness";
import { serviceManagerFor } from "./managers";
import type { ServiceContext } from "./service";
import { systemdManager, systemdUnit } from "./systemd";

function contextFor(home: string, exec: CliEnv["exec"] = fakeExec().exec): ServiceContext {
  return {
    home,
    env: { PATH: "/usr/local/bin:/usr/bin" },
    backlogRoot: join(home, "backlog"),
    port: 4400,
    nodePath: "/opt/node/bin/node",
    cliPath: "/opt/p-backlog/dist/cli.js",
    exec,
    uid: 1000,
    stopProcess: () => true,
  };
}

const unitPath = (home: string) => join(home, ".config/systemd/user/p-backlog.service");

describe("systemdUnit", () => {
  it("запускает serve собранного cli.js с окружением на момент установки и перезапускает при сбое", () => {
    const unit = systemdUnit(contextFor("/home/ann"));

    expect(unit).toContain('ExecStart="/opt/node/bin/node" "/opt/p-backlog/dist/cli.js" serve\n');
    expect(unit).toContain('Environment="BACKLOG_DIR=/home/ann/backlog"\n');
    expect(unit).toContain('Environment="PORT=4400"\n');
    expect(unit).toContain('Environment="PATH=/usr/local/bin:/usr/bin"\n');
    expect(unit).toContain('Environment="HOME=/home/ann"\n');
    expect(unit).toContain("Restart=on-failure\n");
    expect(unit).toContain("WantedBy=default.target\n");
  });

  it("экранирует кавычки, обратную косую черту, спецификаторы и переменные systemd", () => {
    const unit = systemdUnit({ ...contextFor("/home/ann"), cliPath: '/opt/"x"\\100%/$HOME/cli.js', backlogRoot: "/home/ann/100%" });

    expect(unit).toContain('ExecStart="/opt/node/bin/node" "/opt/\\"x\\"\\\\100%%/$$HOME/cli.js" serve\n');
    expect(unit).toContain('Environment="BACKLOG_DIR=/home/ann/100%%"\n');
  });
});

describe("systemdManager", () => {
  it("install пишет unit, перечитывает конфигурацию, включает и перезапускает службу", async () => {
    const home = await makeTempDir();
    let unitAtReload = "";
    const fake = fakeExec(async (command) => {
      if (command === "systemctl --user daemon-reload") unitAtReload = await readFile(unitPath(home), "utf8");
      return { code: 0, output: "" };
    });
    const context = contextFor(home, fake.exec);

    expect(await systemdManager(context).install()).toBe("done");
    expect(fake.calls).toEqual(["systemctl --user daemon-reload", "systemctl --user enable p-backlog.service", "systemctl --user restart p-backlog.service"]);
    expect(unitAtReload).toBe(systemdUnit(context));
  });

  it("отказ systemctl останавливает установку и возвращает его вывод и код, unit остаётся", async () => {
    const home = await makeTempDir();
    const fake = fakeExec((command) => (command.includes(" enable ") ? { code: 1, output: "Failed to connect to bus" } : { code: 0, output: "" }));

    const outcome = await systemdManager(contextFor(home, fake.exec)).install();

    expect(outcome).toEqual({ failed: "systemctl --user enable p-backlog.service", code: 1, output: "Failed to connect to bus" });
    expect(fake.calls).not.toContain("systemctl --user restart p-backlog.service");
    await expect(access(unitPath(home))).resolves.toBeUndefined();
  });

  it("uninstall останавливает и выключает службу, удаляет unit и перечитывает конфигурацию", async () => {
    const home = await makeTempDir();
    let unitGoneAtReload = false;
    const fake = fakeExec(async (command) => {
      if (command === "systemctl --user daemon-reload") unitGoneAtReload = await access(unitPath(home)).then(() => false, () => true);
      return { code: 0, output: "" };
    });
    const manager = systemdManager(contextFor(home, fake.exec));
    await manager.install();
    fake.calls.length = 0;

    expect(await manager.uninstall()).toBe("done");
    expect(fake.calls).toEqual(["systemctl --user disable --now p-backlog.service", "systemctl --user daemon-reload"]);
    expect(unitGoneAtReload).toBe(true);
  });

  it("uninstall без unit сообщает, что службы нет, и systemctl не зовёт", async () => {
    const home = await makeTempDir();
    const fake = fakeExec();

    expect(await systemdManager(contextFor(home, fake.exec)).uninstall()).toBe("absent");
    expect(fake.calls).toEqual([]);
  });
});

describe("serviceManagerFor", () => {
  it("на Linux без systemctl служба не поддерживается", async () => {
    const home = await makeTempDir();
    const fake = fakeExec((command) => (command === "systemctl --user --version" ? { code: 127, output: "" } : { code: 0, output: "" }));

    expect(await serviceManagerFor("linux", contextFor(home, fake.exec))).toBeNull();
  });

  it("на Linux с systemctl служба — unit systemd --user", async () => {
    const home = await makeTempDir();

    expect((await serviceManagerFor("linux", contextFor(home)))?.file).toBe(unitPath(home));
  });
});
