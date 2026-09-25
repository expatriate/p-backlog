import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileExists, numberRecordedIn, serviceEnvironment, type ServiceContext, type ServiceManager } from "./service";

const LABEL = "local.p-backlog";
const BOOTSTRAP_RETRY_ATTEMPTS = 5;
const BOOTSTRAP_RETRY_DELAY_MS = 300;
const NO_SUCH_PROCESS_CODE = 3;
const SERVICE_NOT_FOUND_CODE = 113;
const NOT_LOADED_CODES = new Set([NO_SUCH_PROCESS_CODE, SERVICE_NOT_FOUND_CODE]);
const PREVIOUS_BOOTOUT_UNFINISHED_CODE = 5;

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

function xml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char);
}

function logPath(home: string): string {
  return posix.join(home, "Library/Logs/p-backlog.log");
}

export function launchdPlist(context: ServiceContext): string {
  const entries = Object.entries(serviceEnvironment(context))
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join("\n");
  const log = xml(logPath(context.home));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(context.nodePath)}</string>
    <string>${xml(context.cliPath)}</string>
    <string>serve</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${entries}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

export function launchdManager(context: ServiceContext, delay: (ms: number) => Promise<void> = sleep): ServiceManager {
  const file = join(context.home, "Library/LaunchAgents", `${LABEL}.plist`);
  const domain = `gui/${context.uid}`;
  const bootout = () => context.exec("launchctl", ["bootout", `${domain}/${LABEL}`]);
  const bootstrap = () => context.exec("launchctl", ["bootstrap", domain, file]);
  return {
    file,
    logs: logPath(context.home),
    async install() {
      await bootout();
      await mkdir(dirname(file), { recursive: true });
      await mkdir(dirname(logPath(context.home)), { recursive: true });
      await writeFile(file, launchdPlist(context));
      let result = await bootstrap();
      for (let attempt = 1; result.code === PREVIOUS_BOOTOUT_UNFINISHED_CODE && attempt < BOOTSTRAP_RETRY_ATTEMPTS; attempt++) {
        await delay(BOOTSTRAP_RETRY_DELAY_MS);
        result = await bootstrap();
      }
      return result.code === 0 ? "done" : { failed: "launchctl bootstrap", code: result.code, output: result.output };
    },
    async uninstall() {
      if (!(await fileExists(file))) return "absent";
      const { code, output } = await bootout();
      if (code !== 0 && !NOT_LOADED_CODES.has(code)) return { failed: "launchctl bootout", code, output };
      await rm(file, { force: true });
      return "done";
    },
    async registered() {
      return (await fileExists(file)) && (await context.exec("launchctl", ["print", `${domain}/${LABEL}`])).code === 0;
    },
    installedPort: () => numberRecordedIn(file, /<key>PORT<\/key>\s*<string>(\d+)<\/string>/),
  };
}
