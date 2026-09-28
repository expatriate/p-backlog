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
    case "invalid":
      for (const error of result.errors) io.warn(io.core.problem(error));
      return EXIT.invalid;
  }
}
