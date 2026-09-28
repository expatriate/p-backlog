import { AGENT_SPECS, AGENTS, agentVoice, detectAgents, type Agent, type AgentVoice } from "../agents/agent";
import { installAgentHook, removeAgentHook } from "../agents/agent-hooks";
import { linkAgentSkill } from "../agents/agent-skill";
import { agentPlugin } from "../agents/claude-plugin";
import type { HookInstallResult, HookRemoveResult } from "../agents/grouped-stop-hooks";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, UsageError, type CliIo, type ExitCode } from "../io";
import { linkSkillFor, skillLinkPath, skillSourceDir, unlinkOurSkill } from "../skill-link";
import { installService } from "./service";

export const setupCommand: CliCommand = {
  name: "setup",
  usage: () => [`[--agent ${AGENTS.join("|")}] [--service]`, `--remove-manual [--agent ${AGENTS.join("|")}]`],
  run: runSetup,
};

async function runSetup(args: string[], io: CliIo): Promise<ExitCode> {
  const options = parseOptions(io.language, args, { service: { type: "boolean" }, agent: { type: "string" }, "remove-manual": { type: "boolean" } });
  if (options["remove-manual"] && options.service) throw new UsageError(io.cli.removeManualWithService);
  const agents = await targetAgents(options.agent, io);
  const outcomes: boolean[] = [];
  for (const agent of agents) outcomes.push(options["remove-manual"] ? await removeManualSetup(agent, agents, io) : await setUpAgent(agent, io));
  const serviceCode = options.service ? await installService(io) : EXIT.ok;
  return outcomes.every(Boolean) ? serviceCode : EXIT.failed;
}

async function targetAgents(option: string | undefined, io: CliIo): Promise<Agent[]> {
  if (option !== undefined) return [parseChoice(io.language, option, AGENTS, io.cli.optionLabel.agent)];
  const detection = await detectAgents(io);
  for (const { agent, dir } of detection.missing) agentVoice(agent, io).print(io.cli.agentNotFound(dir));
  return detection.found;
}

async function setUpAgent(agent: Agent, io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const plugin = await agentPlugin(agent, io);
  if (plugin !== null) {
    voice.print(io.cli.pluginManages(plugin));
    return true;
  }
  if (!(await installAgentSkill(agent, io, voice))) return false;
  const hook = await installAgentHook(agent, io);
  const reported = reportHook(hook, AGENT_SPECS[agent].hookConfigPath(io), io, voice);
  const { label, hookApprovalCommand } = AGENT_SPECS[agent];
  if (hookApprovalCommand !== null && (hook === "added" || hook === "updated")) voice.print(io.cli.hookApproval(label, hookApprovalCommand));
  return reported;
}

async function installAgentSkill(agent: Agent, io: CliIo, voice: AgentVoice): Promise<boolean> {
  const source = skillSourceDir(io.packageRoot, io.language);
  const link = await linkAgentSkill(agent, io, (options) => linkSkillFor(io.language, options));
  if (!link.ok) {
    voice.warn(io.cli.installSkillLinkFailed(link.target, link.failed));
    return false;
  }
  if (link.result === "foreign") {
    voice.warn(io.cli.installSkillForeign(link.target, source));
    return false;
  }
  voice.print(link.result === "linked" ? io.cli.installSkillLinked(link.target, source) : io.cli.installSkillKept(link.target));
  await removeLegacySkillLinks(agent, io, voice);
  return true;
}

async function removeLegacySkillLinks(agent: Agent, io: CliIo, voice: AgentVoice): Promise<void> {
  for (const legacyDir of AGENT_SPECS[agent].legacySkillsDirs(io)) {
    if ((await unlinkOurSkill(legacyDir)) === "removed") voice.print(io.cli.manualSkillRemoval.removed(skillLinkPath(legacyDir)));
  }
}

function reportHook(result: HookInstallResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  if (typeof result === "string") {
    const report = { added: io.cli.installHookAdded, exists: io.cli.installHookExists, updated: io.cli.installHookUpdated }[result];
    voice.print(report(configPath));
    return true;
  }
  if (result.failed === "unreadable") {
    voice.warn(io.cli.installHookConfigUnreadable(configPath, result.code));
    return false;
  }
  voice.warn(io.cli.installHookConfigInvalid(configPath));
  return false;
}

async function removeManualSetup(agent: Agent, removing: readonly Agent[], io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const skillsDir = AGENT_SPECS[agent].skillsDir(io);
  const target = skillLinkPath(skillsDir);
  const sharer = await remainingSkillDirUser(agent, removing, io);
  voice.print(sharer === null ? io.cli.manualSkillRemoval[await unlinkOurSkill(skillsDir)](target) : io.cli.manualSkillShared(target, AGENT_SPECS[sharer].label));
  await removeLegacySkillLinks(agent, io, voice);
  return reportHookRemoval(await removeAgentHook(agent, io), AGENT_SPECS[agent].hookConfigPath(io), io, voice);
}

async function remainingSkillDirUser(agent: Agent, removing: readonly Agent[], io: CliIo): Promise<Agent | null> {
  const skillsDir = AGENT_SPECS[agent].skillsDir(io);
  const { found } = await detectAgents(io);
  return found.find((other) => !removing.includes(other) && AGENT_SPECS[other].skillsDir(io) === skillsDir) ?? null;
}

function reportHookRemoval(result: HookRemoveResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  if (result === "removed" || result === "absent") {
    voice.print(io.cli.manualHookRemoval[result](configPath));
    return true;
  }
  voice.warn(result.failed === "unreadable" ? io.cli.removeHookConfigUnreadable(configPath, result.code) : io.cli.removeHookConfigInvalid(configPath));
  return false;
}
