import type { UpdateTaskFailure } from "../core/store/write-result";
import { EXIT, type CliIo, type ExitCode } from "./io";

export function reportUpdateFailure(io: CliIo, id: string, result: UpdateTaskFailure): ExitCode {
  switch (result.reason) {
    case "not-found":
      io.warn(io.cli.taskNotFound(id));
      return EXIT.notFound;
    case "conflict":
      io.warn(io.cli.fileConflict(id));
      return EXIT.invalid;
    case "busy":
      io.warn(io.core.fileBusy(result));
      return EXIT.failed;
    case "invalid":
      for (const problem of result.problems) io.warn(io.core.problem(problem));
      return EXIT.invalid;
  }
}
