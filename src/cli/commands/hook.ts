import { errorText } from "../../core/errors";
import { dirname } from "node:path";
import { z } from "zod";
import { checkBacklog } from "../../core/check/check-backlog";
import { coreMessages } from "../../core/messages";
import { formatLocalDay } from "../../core/model/dates";
import { readJournal } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { parseJson } from "../../core/store/fs-utils";
import { findProjectForDir } from "../../core/store/resolve-project";
import { readSignalsShown, writeSignalsShown } from "../../core/store/signals-shown";
import { readSessionShown, writeSessionShown } from "../../core/store/session-shown";
import { HOOK_STOP_EVENT, hookMessage } from "../../core/stats/cost/hook-signature";
import { pluralCount } from "../../core/stats/format";
import { statsSignals } from "../../core/stats/signals/signals";
import { markShown, signalsToShow, type SignalsShown } from "../../core/stats/signals/shown";
import type { Signal } from "../../core/stats/types";
import type { Project, Task } from "../../core/model/types";
import { usageError, type CliCommand } from "../command";
import { EXIT, type CliIo } from "../io";
import { stopReason } from "../stop-reason";

const stopEventSchema = z.object({ cwd: z.string(), session_id: z.string().optional(), stop_hook_active: z.boolean().optional() });

export const hookCommand: CliCommand = {
  name: "hook",
  usage: [`${HOOK_STOP_EVENT}   (для хука Stop в Claude Code, событие читается из stdin)`],
  run: runHook,
};

async function runHook(args: string[], io: CliIo): Promise<number> {
  if (args.length !== 1 || args[0] !== HOOK_STOP_EVENT) throw usageError(hookCommand);
  const event = parseJson(await io.readStdin(), stopEventSchema);
  if (event === null || event.stop_hook_active === true) return EXIT.ok;

  const loaded = await loadBacklog(io.backlogRoot);
  const project = findProjectForDir(loaded.projects, event.cwd, io.home);
  if (!project) return EXIT.ok;
  const { candidates } = await checkBacklog(io.backlogRoot, loaded, { projectIds: [project.id], mode: "changed", now: io.now(), home: io.home, messages: coreMessages(io.language) });
  const lowPriority = new Set(loaded.tasks.filter((task) => task.priority === "low").map((task) => task.id));
  const worthTelling = candidates.filter((candidate) => !lowPriority.has(candidate.task.id));
  const lowCount = candidates.length - worthTelling.length;
  const session = await sessionMemory(project, event.session_id, io);
  const blocking = worthTelling.filter((candidate) => !session.told.has(candidate.task.id));

  const signals = await freshSignals(project, loaded.tasks.filter((task) => task.projectId === project.id), lowChangedSignals(lowCount), io);
  const response = {
    ...(blocking.length > 0 ? { decision: "block", reason: stopReason(project.id, blocking) } : {}),
    ...(signals.fresh.length > 0 ? { systemMessage: hookMessage(project.id, signals.fresh.map((signal) => signal.text).join("; ")) } : {}),
  };
  if (Object.keys(response).length > 0) io.print(JSON.stringify(response));
  await signals.remember();
  await session.remember(blocking.map((candidate) => candidate.task.id));
  return EXIT.ok;
}

type SessionMemory = { told: ReadonlySet<string>; remember: (ids: readonly string[]) => Promise<void> };

async function sessionMemory(project: Project, session: string | undefined, io: CliIo): Promise<SessionMemory> {
  if (session === undefined) return { told: new Set(), remember: () => Promise.resolve() };
  const projectDir = dirname(project.path);
  try {
    const shown = await readSessionShown(projectDir, session);
    return {
      told: new Set(shown.tasks),
      remember: async (ids) => {
        if (ids.length === 0) return;
        await writeSessionShown(projectDir, { session, tasks: [...new Set([...shown.tasks, ...ids])] });
      },
    };
  } catch (error) {
    io.warn(`Не удалось прочитать показанные задачи сессии: ${errorText(error)}`);
    return { told: new Set(), remember: () => Promise.resolve() };
  }
}

type FreshSignals = { fresh: Signal[]; remember: () => Promise<void> };

function lowChangedSignals(count: number): Signal[] {
  if (count === 0) return [];
  return [{ kind: "low-changed", text: `Код менялся у ${pluralCount(count, "задачи", "задач", "задач")} с низким приоритетом — перепроверьте при случае («почисти беклог»)` }];
}

async function freshSignals(project: Project, tasks: readonly Task[], extra: readonly Signal[], io: CliIo): Promise<FreshSignals> {
  const projectDir = dirname(project.path);
  const today = formatLocalDay(io.now());
  try {
    const journal = await readJournal(projectDir, project.id);
    const shown = await readSignalsShown(projectDir);
    const fresh = signalsToShow([...statsSignals({ tasks, journals: [journal], now: io.now(), projectId: project.id }), ...extra], shown, today);
    return { fresh, remember: () => (fresh.length === 0 ? Promise.resolve() : rememberShown(projectDir, markShown(shown, fresh, today), io)) };
  } catch (error) {
    io.warn(`Не удалось посчитать тревоги: ${errorText(error)}`);
    return { fresh: [], remember: () => Promise.resolve() };
  }
}

async function rememberShown(projectDir: string, shown: SignalsShown, io: CliIo): Promise<void> {
  try {
    await writeSignalsShown(projectDir, shown);
  } catch (error) {
    io.warn(`Не удалось сохранить показанные тревоги: ${errorText(error)}`);
  }
}
