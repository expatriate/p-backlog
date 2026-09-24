import { join } from "node:path";
import { claudeSettingsPath, claudeSkillsDir } from "../../core/claude-dir";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { linkSkillFor, skillSourceDir } from "../skill-link";
import { addStopHook, type StopHookResult } from "../stop-hook";

export const setupCommand: CliCommand = {
  name: "setup",
  usage: () => [""],
  run: runSetup,
};

async function runSetup(args: string[], io: CliIo): Promise<number> {
  parseOptions(io.language, args, {});
  return (await runSetupSteps(io)) ? EXIT.ok : EXIT.failed;
}

/** @public — consumed by the `--service` step Task 4 adds to this command. */
export async function runSetupSteps(io: CliIo): Promise<boolean> {
  const messages = cliMessages(io.language);
  const skillsDir = claudeSkillsDir(io.env, io.home);
  const target = join(skillsDir, "backlog");
  const source = skillSourceDir(io.repoRoot, io.language);
  const link = await linkSkillFor(io.language, { skillsDir, repoRoot: io.repoRoot, platform: io.platform }).catch((error: NodeJS.ErrnoException) => ({
    error,
  }));
  if (typeof link === "object") {
    io.warn(messages.installSkillLinkFailed(target, link.error.code ?? link.error.message));
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
