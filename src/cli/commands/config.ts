import { warnPathErrors } from "../../core/errors";
import { LANGUAGES, type Language } from "../../core/i18n/language";
import { coreMessages } from "../../core/messages";
import { writeSettings } from "../../core/store/settings";
import { AGENT_SPECS, agentVoice, detectAgents, type Agent } from "../agents/agent";
import { linkAgentSkill } from "../agents/agent-skill";
import { agentPluginReportingFailure, pluginToSwitchTo } from "../agents/claude-plugin";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { cliMessages } from "../messages";
import { linkSkillFor, relinkExistingSkill } from "../skill-link";

export const configCommand: CliCommand = {
  name: "config",
  usage: () => [`language [${LANGUAGES.join("|")}]`],
  run: runConfig,
};

async function runConfig(args: string[], io: CliIo): Promise<ExitCode> {
  const { positionals } = parseCommandArgs(io.language, args, {});
  const [key, ...rest] = positionals;
  if (key === "language") return runLanguage(rest, io);
  throw usageError(configCommand, io.language);
}

async function runLanguage(positionals: string[], io: CliIo): Promise<ExitCode> {
  const [value, ...rest] = positionals;
  if (rest.length > 0) throw usageError(configCommand, io.language);
  if (value === undefined) {
    io.print(io.language);
    return EXIT.ok;
  }
  const language = parseChoice(io.language, value, LANGUAGES, io.cli.optionLabel.language);
  await writeSettings(io.backlogRoot, { language });
  io.print(`${io.language} → ${language}`);
  const { unreadableSkipped } = coreMessages(language);
  const { found } = await detectAgents(io, warnPathErrors(io.warn, unreadableSkipped));
  for (const agent of found) await relinkSkill(agent, language, io);
  return EXIT.ok;
}

async function relinkSkill(agent: Agent, language: Language, io: CliIo): Promise<void> {
  const cli = cliMessages(language);
  const { unreadableSkipped } = coreMessages(language);
  const voice = agentVoice(agent, io);
  const lookup = await agentPluginReportingFailure(agent, io, warnPathErrors(voice.warn, unreadableSkipped));
  if (lookup?.plugin) {
    const wanted = pluginToSwitchTo(lookup.plugin, language);
    if (wanted !== null) voice.print(cli.pluginLanguageHint(lookup.plugin, wanted));
    return;
  }
  const pluginUnknown = lookup === null;
  const mayCreateLink = !pluginUnknown && AGENT_SPECS[agent].skillOnLanguageChange === "link";
  const relink = mayCreateLink ? linkSkillFor : relinkExistingSkill;
  const link = await linkAgentSkill(agent, io, (options) => relink(language, options));
  if (!link.ok) voice.warn(cli.installSkillLinkFailed(link.target, link.failed));
  else if (link.result === "foreign") voice.warn(cli.skillForeign(link.target));
  else if (pluginUnknown && link.result === "absent") voice.warn(cli.skillLeftUnverified(language));
}
