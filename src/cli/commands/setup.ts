import { join } from "node:path";
import { errorCodeOrText } from "../../core/errors";
import { AGENT_LABELS, AGENTS, agentSkillsDir, detectAgents, legacySkillsDirs, type Agent } from "../agents/agent";
import { agentHookConfigPath, installAgentHook, removeAgentHook } from "../agents/agent-hooks";
import { agentPlugin } from "../agents/claude-plugin";
import type { HookInstallResult, HookRemoveResult } from "../agents/grouped-stop-hooks";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, UsageError, type CliIo } from "../io";
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
  if (options["remove-manual"] && options.service) throw new UsageError(cliMessages(io.language).removeManualWithService);
  const agents = await targetAgents(options.agent, io);
  const outcomes: boolean[] = [];
  for (const agent of agents) outcomes.push(options["remove-manual"] ? await removeManualSetup(agent, agents, io) : await setUpAgent(agent, io));
  const serviceCode = options.service ? await installService(io) : EXIT.ok;
  return outcomes.every(Boolean) ? serviceCode : EXIT.failed;
}

async function targetAgents(option: string | undefined, io: CliIo): Promise<Agent[]> {
  const messages = cliMessages(io.language);
  if (option !== undefined) return [parseChoice(io.language, option, AGENTS, messages.optionLabel.agent)];
  const detection = await detectAgents(io);
  for (const { agent, dir } of detection.missing) agentVoice(agent, io).print(messages.agentNotFound(dir));
  return detection.found;
}

function agentVoice(agent: Agent, io: CliIo): AgentVoice {
  const label = AGENT_LABELS[agent];
  return { print: (line) => io.print(`${label}: ${line}`), warn: (line) => io.warn(`${label}: ${line}`) };
}

async function setUpAgent(agent: Agent, io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const plugin = await agentPlugin(agent, io);
  if (plugin !== null) {
    voice.print(cliMessages(io.language).pluginManages(plugin));
    return true;
  }
  if (!(await linkAgentSkill(agent, io, voice))) return false;
  const hook = await installAgentHook(agent, io);
  const reported = reportHook(hook, agentHookConfigPath(agent, io), io, voice);
  if (agent === "codex" && (hook === "added" || hook === "updated")) voice.print(cliMessages(io.language).codexHookApproval);
  return reported;
}

async function linkAgentSkill(agent: Agent, io: CliIo, voice: AgentVoice): Promise<boolean> {
  const messages = cliMessages(io.language);
  const skillsDir = agentSkillsDir(agent, io);
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
  await removeLegacySkillLinks(agent, io, voice);
  return true;
}

async function removeLegacySkillLinks(agent: Agent, io: CliIo, voice: AgentVoice): Promise<void> {
  for (const legacyDir of legacySkillsDirs(agent, io)) {
    if ((await unlinkOurSkill(legacyDir)) === "removed") voice.print(cliMessages(io.language).manualSkillRemoval.removed(join(legacyDir, "backlog")));
  }
}

function reportHook(result: HookInstallResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  const messages = cliMessages(io.language);
  if (typeof result === "string") {
    const report = { added: messages.installHookAdded, exists: messages.installHookExists, updated: messages.installHookUpdated }[result];
    voice.print(report(configPath));
    return true;
  }
  if (result.failed === "unreadable") {
    voice.warn(messages.installHookConfigUnreadable(configPath, result.code));
    return false;
  }
  voice.warn(messages.installHookConfigInvalid(configPath));
  return false;
}

async function removeManualSetup(agent: Agent, removing: readonly Agent[], io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const messages = cliMessages(io.language);
  const skillsDir = agentSkillsDir(agent, io);
  const target = join(skillsDir, "backlog");
  const sharer = await remainingSkillDirUser(agent, removing, io);
  voice.print(sharer === null ? messages.manualSkillRemoval[await unlinkOurSkill(skillsDir)](target) : messages.manualSkillShared(target, AGENT_LABELS[sharer]));
  await removeLegacySkillLinks(agent, io, voice);
  return reportHookRemoval(await removeAgentHook(agent, io), agentHookConfigPath(agent, io), io, voice);
}

async function remainingSkillDirUser(agent: Agent, removing: readonly Agent[], io: CliIo): Promise<Agent | null> {
  const skillsDir = agentSkillsDir(agent, io);
  const { found } = await detectAgents(io);
  return found.find((other) => !removing.includes(other) && agentSkillsDir(other, io) === skillsDir) ?? null;
}

function reportHookRemoval(result: HookRemoveResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  const messages = cliMessages(io.language);
  if (result === "removed" || result === "absent") {
    voice.print(messages.manualHookRemoval[result](configPath));
    return true;
  }
  voice.warn(result.failed === "unreadable" ? messages.removeHookConfigUnreadable(configPath, result.code) : messages.removeHookConfigInvalid(configPath));
  return false;
}
