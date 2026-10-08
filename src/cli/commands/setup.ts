import { errorCodeOrText, warnPathErrors } from "../../core/errors";
import { readReportingFailure } from "../../core/store/fs-utils";
import { AGENT_SPECS, AGENTS, agentVoice, detectAgents, type Agent, type AgentDetection, type AgentVoice } from "../agents/agent";
import { installAgentHook, removeAgentHook } from "../agents/agent-hooks";
import { linkAgentSkill } from "../agents/agent-skill";
import { agentPlugin } from "../agents/claude-plugin";
import type { HookInstallResult, HookRemoveResult } from "../agents/grouped-stop-hooks";
import type { CliCommand } from "../command";
import { isFailure } from "../failure";
import { EXIT, parseChoice, parseOptions, UsageError, type CliIo, type ExitCode } from "../io";
import { linkSkillFor, skillLinkPath, skillSourceDir, unlinkOurSkill, type SkillUnlinkResult } from "../skill-link";
import { installService } from "./service";

export const setupCommand: CliCommand = {
  name: "setup",
  usage: () => [`[--agent ${AGENTS.join("|")}] [--service]`, `--remove-manual [--agent ${AGENTS.join("|")}]`],
  run: runSetup,
};

async function runSetup(args: string[], io: CliIo): Promise<ExitCode> {
  const options = parseOptions(io.language, args, { service: { type: "boolean" }, agent: { type: "string" }, "remove-manual": { type: "boolean" } });
  if (options["remove-manual"] && options.service) throw new UsageError(io.cli.removeManualWithService);
  const installed = installedAgents(io);
  const agents = await targetAgents(options.agent, installed, io);
  const outcomes: boolean[] = [];
  for (const agent of agents) outcomes.push(options["remove-manual"] ? await removeManualSetup(agent, { removing: agents, installed }, io) : await setUpAgent(agent, io));
  const serviceCode = options.service ? await installService(io) : EXIT.ok;
  return outcomes.every(Boolean) ? serviceCode : EXIT.failed;
}

type InstalledAgents = () => Promise<AgentDetection>;

function installedAgents(io: CliIo): InstalledAgents {
  let detection: Promise<AgentDetection> | undefined;
  return () => (detection ??= detectAgents(io, warnPathErrors(io.warn, io.core.unreadableSkipped)));
}

async function targetAgents(option: string | undefined, installed: InstalledAgents, io: CliIo): Promise<Agent[]> {
  if (option !== undefined) return [parseChoice(io.language, option, AGENTS, io.cli.optionLabel.agent)];
  const detection = await installed();
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
    if ((await unlinkReportingFailure(legacyDir, io, voice)) === "removed") voice.print(io.cli.manualSkillRemoval.removed(skillLinkPath(legacyDir)));
  }
}

function unlinkReportingFailure(skillsDir: string, io: CliIo, voice: AgentVoice): Promise<SkillUnlinkResult | null> {
  return readReportingFailure(
    skillLinkPath(skillsDir),
    () => unlinkOurSkill(skillsDir),
    (target, error) => voice.warn(io.cli.removeSkillLinkFailed(target, errorCodeOrText(error))),
  );
}

function reportHook(result: HookInstallResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  if (isFailure(result)) {
    voice.warn(result.failed === "unreadable" ? io.cli.installHookConfigUnreadable(configPath, result.code) : io.cli.installHookConfigInvalid(configPath));
    return false;
  }
  const report = { added: io.cli.installHookAdded, exists: io.cli.installHookExists, updated: io.cli.installHookUpdated }[result];
  voice.print(report(configPath));
  return true;
}

type ManualRemoval = { removing: readonly Agent[]; installed: InstalledAgents };

async function removeManualSetup(agent: Agent, removal: ManualRemoval, io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const skillSettled = await removeSkillLinkUnlessShared(agent, removal, io);
  await removeLegacySkillLinks(agent, io, voice);
  const hookRemoved = reportHookRemoval(await removeAgentHook(agent, io), AGENT_SPECS[agent].hookConfigPath(io), io, voice);
  return skillSettled && hookRemoved;
}

async function removeSkillLinkUnlessShared(agent: Agent, removal: ManualRemoval, io: CliIo): Promise<boolean> {
  const voice = agentVoice(agent, io);
  const skillsDir = AGENT_SPECS[agent].skillsDir(io);
  const target = skillLinkPath(skillsDir);
  const sharer = await remainingSkillDirUser(agent, removal, io);
  if (sharer !== null) {
    voice.print(io.cli.manualSkillShared(target, AGENT_SPECS[sharer].label));
    return true;
  }
  const unlinked = await unlinkReportingFailure(skillsDir, io, voice);
  if (unlinked !== null) voice.print(io.cli.manualSkillRemoval[unlinked](target));
  return unlinked !== null;
}

async function remainingSkillDirUser(agent: Agent, { removing, installed }: ManualRemoval, io: CliIo): Promise<Agent | null> {
  const skillsDir = AGENT_SPECS[agent].skillsDir(io);
  const { found } = await installed();
  return found.find((other) => !removing.includes(other) && AGENT_SPECS[other].skillsDir(io) === skillsDir) ?? null;
}

function reportHookRemoval(result: HookRemoveResult, configPath: string, io: CliIo, voice: AgentVoice): boolean {
  if (isFailure(result)) {
    voice.warn(result.failed === "unreadable" ? io.cli.removeHookConfigUnreadable(configPath, result.code) : io.cli.removeHookConfigInvalid(configPath));
    return false;
  }
  voice.print(io.cli.manualHookRemoval[result](configPath));
  return true;
}
