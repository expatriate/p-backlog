import type { UpdateTaskFailure } from "../core/store/write-result";
import { coreMessages } from "../core/messages";
import { EXIT, type CliIo } from "./io";
import { cliMessages } from "./messages";

export function reportUpdateFailure(io: CliIo, id: string, result: UpdateTaskFailure): number {
  switch (result.reason) {
    case "not-found":
      io.warn(cliMessages(io.language).taskNotFound(id));
      return EXIT.notFound;
    case "conflict":
      io.warn(cliMessages(io.language).fileConflict(id));
      return EXIT.invalid;
    case "invalid":
      for (const error of result.errors) io.warn(coreMessages(io.language).problem(error));
      return EXIT.invalid;
  }
}
