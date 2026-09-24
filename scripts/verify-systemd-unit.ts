import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemdUnit } from "../src/cli/service/systemd";

const unitDir = mkdtempSync(join(tmpdir(), "p-backlog-systemd-"));
const unitFile = join(unitDir, "p-backlog.service");
writeFileSync(
  unitFile,
  systemdUnit({
    home: "/home/ci",
    env: { PATH: "/usr/bin:/bin" },
    backlogRoot: "/home/ci/backlog",
    port: 4317,
    nodePath: "/usr/bin/node",
    cliPath: "/opt/p-backlog/dist/cli.js",
    exec: async () => ({ code: 0, output: "" }),
    uid: 1000,
    stopProcess: () => true,
  }),
);
process.stdout.write(unitFile);
