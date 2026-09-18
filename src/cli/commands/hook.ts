import { z } from "zod";
import { checkBacklog } from "../../core/check/check-backlog";
import { loadBacklog } from "../../core/store/load";
import { findProjectForDir } from "../../core/store/resolve-project";
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
  if (candidates.length > 0) io.print(JSON.stringify({ decision: "block", reason: stopReason(project.id, candidates) }));
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
