import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileExists, portRecordedIn, serviceEnvironment, type ServiceContext, type ServiceManager } from "./service";

const LABEL = "local.p-backlog";

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

function xml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char);
}

function logPath(home: string): string {
  return join(home, "Library/Logs/p-backlog.log");
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

export function launchdManager(context: ServiceContext): ServiceManager {
  const file = join(context.home, "Library/LaunchAgents", `${LABEL}.plist`);
  const domain = `gui/${context.uid}`;
  const bootout = () => context.exec("launchctl", ["bootout", `${domain}/${LABEL}`]);
  return {
    file,
    logs: logPath(context.home),
    async install() {
      await bootout();
      await mkdir(dirname(file), { recursive: true });
      await mkdir(dirname(logPath(context.home)), { recursive: true });
      await writeFile(file, launchdPlist(context));
      const { code, output } = await context.exec("launchctl", ["bootstrap", domain, file]);
      return code === 0 ? "done" : { failed: "launchctl bootstrap", code, output };
    },
    async uninstall() {
      if (!(await fileExists(file))) return "absent";
      await bootout();
      await rm(file, { force: true });
      return "done";
    },
    async registered() {
      return (await fileExists(file)) && (await context.exec("launchctl", ["print", `${domain}/${LABEL}`])).code === 0;
    },
    installedPort: () => portRecordedIn(file, /<key>PORT<\/key>\s*<string>(\d+)<\/string>/),
  };
}
