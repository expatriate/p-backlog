import { errorText } from "../../core/errors";
import { dirname } from "node:path";
import { checkBacklog } from "../../core/check/check-backlog";
import { formatLocalDay } from "../../core/model/dates";
import { FileBusyError } from "../../core/store/file-lock";
import { claimHookTurn } from "../../core/store/hook-turns";
import { readJournal } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { findProjectForDir } from "../../core/store/resolve-project";
import { readSignalsShown, rememberSignalsShown } from "../../core/store/signals-shown";
import { readSessionShown, rememberSessionShown } from "../../core/store/session-shown";
import { HOOK_STOP_EVENT, hookMessage } from "../../core/hook-signature";
import { statsSignals } from "../../core/stats/signals/signals";
import { signalsToShow } from "../../core/stats/signals/shown";
import type { Signal } from "../../core/stats/types";
import type { Project, Task } from "../../core/model/types";
import { AGENTS, type Agent } from "../agents/agent";
import { carriesSystemMessage, formatStopAnswer, parseStopEvent, type StopEvent } from "../agents/stop-event";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { cliMessages } from "../messages";
import { stopReason } from "../stop-reason";

const DEFAULT_AGENT: Agent = "claude";

const rememberNothing = (): Promise<void> => Promise.resolve();

export const hookCommand: CliCommand = {
  name: "hook",
  usage: (language) => [cliMessages(language).hookUsage(HOOK_STOP_EVENT, AGENTS)],
  run: runHook,
  failureExit: EXIT.ok,
};

async function runHook(args: string[], io: CliIo): Promise<ExitCode> {
  const { values, positionals } = parseCommandArgs(io.language, args, { agent: { type: "string" } });
  if (positionals.length !== 1 || positionals[0] !== HOOK_STOP_EVENT) throw usageError(hookCommand, io.language);
  const agent = values.agent === undefined ? DEFAULT_AGENT : parseChoice(io.language, values.agent, AGENTS, io.cli.optionLabel.agent);
  const event = parseStopEvent(agent, await io.readStdin());
  if (event === null || event.skip) return EXIT.ok;

  const loaded = await loadBacklog(io.backlogRoot);
  const project = findProjectForDir(loaded.projects, event.cwd, io.home);
  if (!project) return EXIT.ok;
  if (!(await isFirstHookOfTurn(agent, event, io))) return EXIT.ok;
  const { candidates } = await checkBacklog(io.backlogRoot, loaded, { projectIds: [project.id], mode: "changed", now: io.now(), home: io.home, messages: io.core, warn: io.warn, workingDir: event.cwd });
  const lowPriority = new Set(loaded.tasks.filter((task) => task.priority === "low").map((task) => task.id));
  const worthTelling = candidates.filter((candidate) => !lowPriority.has(candidate.task.id));
  const lowCount = candidates.length - worthTelling.length;
  const session = await sessionMemory(project, event.session, io);
  const blocking = worthTelling.filter((candidate) => !session.told.has(candidate.task.id));

  const signals = carriesSystemMessage(agent)
    ? await freshSignals(project, loaded.tasks.filter((task) => task.projectId === project.id), lowChangedSignals(lowCount), io)
    : NO_SIGNALS;
  const answer = formatStopAnswer(agent, {
    reason: blocking.length > 0 ? stopReason(io.language, project.id, blocking) : null,
    systemMessage: signals.fresh.length > 0 ? hookMessage(io.language, project.id, signals.fresh.map((signal) => io.core.signal(signal)).join("; ")) : null,
  });
  if (answer !== null) io.print(answer);
  await signals.remember();
  await session.remember(blocking.map((candidate) => candidate.task.id));
  return EXIT.ok;
}

async function isFirstHookOfTurn(agent: Agent, event: StopEvent, io: CliIo): Promise<boolean> {
  if (event.session === undefined || event.turn === undefined) return true;
  try {
    return await claimHookTurn(io.backlogRoot, `${agent}:${event.session}:${event.turn}`, io.now());
  } catch (error) {
    if (error instanceof FileBusyError) return false;
    io.warn(io.cli.hookTurnClaimFailed(errorText(error)));
    return true;
  }
}

type SessionMemory = { told: ReadonlySet<string>; remember: (ids: readonly string[]) => Promise<void> };

const NO_SESSION_MEMORY: SessionMemory = { told: new Set(), remember: rememberNothing };

async function sessionMemory(project: Project, session: string | undefined, io: CliIo): Promise<SessionMemory> {
  if (session === undefined) return NO_SESSION_MEMORY;
  const projectDir = dirname(project.path);
  try {
    return {
      told: new Set(await readSessionShown(projectDir, session)),
      remember: async (ids) => {
        if (ids.length > 0) await rememberSessionShown(projectDir, session, ids, io.now()).catch((error: unknown) => io.warn(io.cli.sessionShownWriteFailed(errorText(error))));
      },
    };
  } catch (error) {
    io.warn(io.cli.sessionShownReadFailed(errorText(error)));
    return NO_SESSION_MEMORY;
  }
}

type FreshSignals = { fresh: Signal[]; remember: () => Promise<void> };

const NO_SIGNALS: FreshSignals = { fresh: [], remember: rememberNothing };

function lowChangedSignals(count: number): Signal[] {
  if (count === 0) return [];
  return [{ kind: "low-changed", params: { count } }];
}

async function freshSignals(project: Project, tasks: readonly Task[], extra: readonly Signal[], io: CliIo): Promise<FreshSignals> {
  const projectDir = dirname(project.path);
  const today = formatLocalDay(io.now());
  try {
    const journal = await readJournal(projectDir, project.id);
    const shown = await readSignalsShown(projectDir);
    const fresh = signalsToShow([...statsSignals({ tasks, journals: [journal], now: io.now(), projectId: project.id }), ...extra], shown, today);
    return { fresh, remember: fresh.length === 0 ? rememberNothing : () => rememberShown(projectDir, fresh, today, io) };
  } catch (error) {
    io.warn(io.cli.alertsComputeFailed(errorText(error)));
    return NO_SIGNALS;
  }
}

async function rememberShown(projectDir: string, signals: readonly Signal[], today: string, io: CliIo): Promise<void> {
  try {
    await rememberSignalsShown(projectDir, signals, today);
  } catch (error) {
    io.warn(io.cli.alertsShownWriteFailed(errorText(error)));
  }
}
