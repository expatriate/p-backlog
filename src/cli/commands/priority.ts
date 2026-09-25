import { PRIORITIES } from "../../core/model/types";
import { parseChoice } from "../io";
import { cliMessages } from "../messages";
import { taskFieldCommand } from "../task-field-command";

export const priorityCommand = taskFieldCommand({
  name: "priority",
  choices: PRIORITIES.join("|"),
  parse: (language, value) => parseChoice(language, value, PRIORITIES, cliMessages(language).optionLabel.priority),
  changes: (priority) => ({ priority }),
  label: (task) => task.priority,
});
