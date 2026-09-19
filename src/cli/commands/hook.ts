import { dirname } from "node:path";
import { z } from "zod";
import { checkBacklog } from "../../core/check/check-backlog";
import { formatLocalIso } from "../../core/model/dates";
import { readJournal } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { findProjectForDir } from "../../core/store/resolve-project";
import { readSignalsShown, writeSignalsShown } from "../../core/store/signals-shown";
import { statsSignals } from "../../core/stats/signals/signals";
import { markShown, signalsToShow } from "../../core/stats/signals/shown";
import { EXIT, UsageError, type CliIo } from "../io";
import { stopReason } from "../stop-reason";

const stopEventSchema = z.object({ cwd: z.string(), stop_hook_active: z.boolean().optional() });

export async function runHook(args: string[], io: CliIo): Promise<number> {
  if (args.length !== 1 || args[0] !== "stop") throw new UsageError("Использование: backlog hook stop (событие Claude Code читается из stdin)");
  const event = parseStopEvent(await io.readStdin());
  if (event === null || event.stop_hook_active === true) return EXIT.ok;

  const loaded = await loadBacklog(io.backlogRoot);
  const project = findProjectForDir(loaded.projects, event.cwd, io.home);
  if (!project) return EXIT.ok;
  const { candidates } = await checkBacklog(io.backlogRoot, { projectIds: [project.id], mode: "changed", now: io.now(), home: io.home });

  const projectDir = dirname(project.path);
  const journal = await readJournal(projectDir, project.id);
  const today = formatLocalIso(io.now()).slice(0, 10);
  const shown = await readSignalsShown(projectDir);
  const fresh = signalsToShow(statsSignals({ tasks: loaded.tasks, journals: [journal], now: io.now(), projectId: project.id }), shown, today);
  const response = {
    ...(candidates.length > 0 ? { decision: "block", reason: stopReason(project.id, candidates) } : {}),
    ...(fresh.length > 0 ? { systemMessage: `Беклог ${project.id}: ${fresh.map((signal) => signal.text).join("; ")}` } : {}),
  };
  if (Object.keys(response).length > 0) io.print(JSON.stringify(response));
  if (fresh.length > 0) {
    try {
      await writeSignalsShown(projectDir, markShown(shown, fresh, today));
    } catch (error) {
      io.warn(`Не удалось сохранить показанные тревоги: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return EXIT.ok;
}

function parseStopEvent(text: string): z.infer<typeof stopEventSchema> | null {
  try {
    const parsed = stopEventSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
