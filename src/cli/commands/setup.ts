import { join } from "node:path";
import { errorCodeOrText } from "../../core/errors";
import { claudeSettingsPath, claudeSkillsDir } from "../../core/claude-dir";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { linkSkillFor, skillSourceDir, type SkillLinkResult } from "../skill-link";
import { addStopHook, type StopHookResult } from "../stop-hook";
import { installService } from "./service";

export const setupCommand: CliCommand = {
  name: "setup",
  usage: () => ["[--service]"],
  run: runSetup,
};

async function runSetup(args: string[], io: CliIo): Promise<number> {
  const { service } = parseOptions(io.language, args, { service: { type: "boolean" } });
  const setupDone = await runSetupSteps(io);
  const serviceCode = service ? await installService(io) : EXIT.ok;
  return setupDone ? serviceCode : EXIT.failed;
}

async function runSetupSteps(io: CliIo): Promise<boolean> {
  const messages = cliMessages(io.language);
  const skillsDir = claudeSkillsDir(io.env, io.home);
  const target = join(skillsDir, "backlog");
  const source = skillSourceDir(io.packageRoot, io.language);
  let link: SkillLinkResult;
  try {
    link = await linkSkillFor(io.language, { skillsDir, packageRoot: io.packageRoot, platform: io.platform });
  } catch (error) {
    io.warn(messages.installSkillLinkFailed(target, errorCodeOrText(error)));
    return false;
  }
  if (link === "foreign") {
    io.warn(messages.installSkillForeign(target, source));
    return false;
  }
  io.print(link === "linked" ? messages.installSkillLinked(target, source) : messages.installSkillKept(target));
  const settingsPath = claudeSettingsPath(io.env, io.home);
  return reportHook(await addStopHook(settingsPath, io.platform), settingsPath, io);
}

function reportHook(result: StopHookResult, settingsPath: string, io: CliIo): boolean {
  const messages = cliMessages(io.language);
  if (result === "added") {
    io.print(messages.installHookAdded(settingsPath));
    return true;
  }
  if (result === "exists") {
    io.print(messages.installHookExists(settingsPath));
    return true;
  }
  if (result.failed === "unreadable") {
    io.warn(messages.installSettingsUnreadable(settingsPath, result.code));
    return false;
  }
  io.warn(messages.installSettingsInvalid(settingsPath));
  return false;
}
