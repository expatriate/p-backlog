import type { UpdateTaskFailure } from "../core/store/write-result";
import { coreMessages } from "../core/messages";
import { EXIT, type CliIo } from "./io";

export function reportUpdateFailure(io: CliIo, id: string, result: UpdateTaskFailure): number {
  switch (result.reason) {
    case "not-found":
      io.warn(`Задача ${id} не найдена`);
      return EXIT.notFound;
    case "conflict":
      io.warn(`Файл задачи ${id} изменился во время записи, повторите команду`);
      return EXIT.invalid;
    case "invalid":
      for (const error of result.errors) io.warn(coreMessages(io.language).problem(error));
      return EXIT.invalid;
  }
}
