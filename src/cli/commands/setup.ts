import { join } from "node:path";
import { errorCodeOrText } from "../../core/errors";
import { AGENT_LABELS, AGENTS, agentSkillsDir, detectAgents, type Agent } from "../agents/agent";
import { agentHookConfigPath, installAgentHook, removeAgentHook } from "../agents/agent-hooks";
import { agentPlugin } from "../agents/claude-plugin";
import type { HookInstallResult, HookRemoveResult } from "../agents/grouped-stop-hooks";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { linkSkillFor, skillSourceDir, unlinkOurSkill, type SkillLinkResult } from "../skill-link";
import { installService } from "./service";

type AgentVoice = { print: (line: string) => void; warn: (line: string) => void };

export const setupCommand: CliCommand = {
  name: "setup",
  usage: () => [`[--agent ${AGENTS.join("|")}] [--service]`, `--remove-manual [--agent ${AGENTS.join("|")}]`],
  run: runSetup,
};

async function runSetup(args: string[], io: CliIo): Promise<number> {
  const options = parseOptions(io.language, args, { service: { type: "boolean" }, agent: { type: "string" }, "remove-manual": { type: "boolean" } });
  const agents = await targetAgents(options.agent, io);
  const step = options["remove-manual"] ? removeManualSetup : setUpAgent;
  const outcomes: boolean[] = [];
  for (const agent of agents) outcomes.push(await step(agent, io));
  const serviceCode = options.service && !options["remove-manual"] ? await installService(io) : EXIT.ok;
  return outcomes.every(Boolean) ? serviceCode : EXIT.failed;
}

async function targetAgents(option: string | undefined, io: CliIo): Promise<Agent[]> {
  const messages = cliMessages(io.language);
  if (option !== undefined) return [parseChoice(io.language, option, AGENTS, messages.optionLabel.agent)];
  const detection = await detectAgents(io.env, io.home);
  for (const { agent, dir } of detection.missing) agentVoice(agent, io).print(messages.agentNotFound(dir));
  return detection.found;
}

function agentVoice(agent: Agent, io: CliIo): AgentVoice {
  const label = AGENT_LABELS[agent];
  return { print: (line) => io.print(`${label}: ${line}`), warn: (line) => io.warn(`${label}: ${line}`) };
}

async function setUpAgent(agent: Agent, io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const plugin = await agentPlugin(agent, io.env, io.home);
  if (plugin !== null) {
    voice.print(cliMessages(io.language).pluginManages(plugin));
    return true;
  }
  if (!(await linkAgentSkill(agent, io, voice))) return false;
  return reportHook(await installAgentHook(agent, io), agentHookConfigPath(agent, io.env, io.home), io, voice);
}

async function linkAgentSkill(agent: Agent, io: CliIo, voice: AgentVoice): Promise<boolean> {
  const messages = cliMessages(io.language);
  const skillsDir = agentSkillsDir(agent, io.env, io.home);
  const target = join(skillsDir, "backlog");
  const source = skillSourceDir(io.packageRoot, io.language);
  let link: SkillLinkResult;
  try {
    link = await linkSkillFor(io.language, { skillsDir, packageRoot: io.packageRoot, platform: io.platform });
  } catch (error) {
    voice.warn(messages.installSkillLinkFailed(target, errorCodeOrText(error)));
    return false;
  }
  if (link === "foreign") {
    voice.warn(messages.installSkillForeign(target, source));
    return false;
  }
  voice.print(link === "linked" ? messages.installSkillLinked(target, source) : messages.installSkillKept(target));
  return true;
}

function reportHook(result: HookInstallResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  const messages = cliMessages(io.language);
  if (result === "added") {
    voice.print(messages.installHookAdded(configPath));
    return true;
  }
  if (result === "exists") {
    voice.print(messages.installHookExists(configPath));
    return true;
  }
  if (result.failed === "unreadable") {
    voice.warn(messages.installSettingsUnreadable(configPath, result.code));
    return false;
  }
  voice.warn(messages.installSettingsInvalid(configPath));
  return false;
}

async function removeManualSetup(agent: Agent, io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const messages = cliMessages(io.language);
  const skillsDir = agentSkillsDir(agent, io.env, io.home);
  voice.print(messages.manualSkillRemoval[await unlinkOurSkill(skillsDir)](join(skillsDir, "backlog")));
  return reportHookRemoval(await removeAgentHook(agent, io), agentHookConfigPath(agent, io.env, io.home), io, voice);
}

function reportHookRemoval(result: HookRemoveResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  const messages = cliMessages(io.language);
  if (result === "removed" || result === "absent") {
    voice.print(messages.manualHookRemoval[result](configPath));
    return true;
  }
  voice.warn(result.failed === "unreadable" ? messages.hookConfigUnreadable(configPath, result.code) : messages.hookConfigInvalid(configPath));
  return false;
}
