import { errorCodeOrText } from "../../core/errors";
import { LANGUAGES, type Language } from "../../core/i18n/language";
import { writeSettings } from "../../core/store/settings";
import { AGENT_SPECS, detectAgents, type Agent } from "../agents/agent";
import { agentPlugin, pluginToSwitchTo } from "../agents/claude-plugin";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, parseCommandArgs, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { linkSkillFor, relinkExistingSkill, skillLinkPath } from "../skill-link";

export const configCommand: CliCommand = {
  name: "config",
  usage: () => ["language [ru|en]"],
  run: runConfig,
};

async function runConfig(args: string[], io: CliIo): Promise<number> {
  const { positionals } = parseCommandArgs(io.language, args, {});
  const [key, ...rest] = positionals;
  if (key === "language") return runLanguage(rest, io);
  throw usageError(configCommand, io.language);
}

async function runLanguage(positionals: string[], io: CliIo): Promise<number> {
  const [value, ...rest] = positionals;
  if (rest.length > 0) throw usageError(configCommand, io.language);
  if (value === undefined) {
    io.print(io.language);
    return EXIT.ok;
  }
  const language = parseChoice(io.language, value, LANGUAGES, cliMessages(io.language).optionLabel.language);
  await writeSettings(io.backlogRoot, { language });
  io.print(`${io.language} → ${language}`);
  const { found } = await detectAgents(io);
  for (const agent of found) await relinkSkill(agent, language, io);
  return EXIT.ok;
}

async function relinkSkill(agent: Agent, language: Language, io: CliIo): Promise<void> {
  const messages = cliMessages(language);
  const spec = AGENT_SPECS[agent];
  const { label } = spec;
  const plugin = await agentPlugin(agent, io);
  if (plugin !== null) {
    const wanted = pluginToSwitchTo(plugin, language);
    if (wanted !== null) io.print(`${label}: ${messages.pluginLanguageHint(plugin, wanted)}`);
    return;
  }
  const skillsDir = spec.skillsDir(io);
  const target = skillLinkPath(skillsDir);
  const options = { skillsDir, packageRoot: io.packageRoot, platform: io.platform };
  try {
    const result = spec.skillOnLanguageChange === "link" ? await linkSkillFor(language, options) : await relinkExistingSkill(language, options);
    if (result === "foreign") io.warn(`${label}: ${messages.skillForeign(target)}`);
  } catch (error) {
    io.warn(`${label}: ${messages.installSkillLinkFailed(target, errorCodeOrText(error))}`);
  }
}
