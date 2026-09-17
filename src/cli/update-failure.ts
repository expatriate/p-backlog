import type { UpdateTaskResult } from "../core/store/write-result";
import { EXIT, type CliIo } from "./io";

export function reportUpdateFailure(io: CliIo, id: string, result: Exclude<UpdateTaskResult, { ok: true }>): number {
  switch (result.reason) {
    case "not-found":
      io.warn(`Задача ${id} не найдена`);
      return EXIT.notFound;
    case "conflict":
      io.warn(`Файл задачи ${id} изменился во время записи, повторите команду`);
      return EXIT.invalid;
    case "invalid":
      for (const error of result.errors) io.warn(error);
      return EXIT.invalid;
  }
}
