import { coreMessages } from "../../core/messages";
import { TASK_CATEGORIES } from "../../core/model/types";
import { parseChoice } from "../io";
import { cliMessages } from "../messages";
import { taskFieldCommand } from "../task-field-command";

const NO_CATEGORY = "none";

export const categoryCommand = taskFieldCommand({
  name: "category",
  choices: `${TASK_CATEGORIES.join("|")}|${NO_CATEGORY}`,
  parse: (language, value) => (value === NO_CATEGORY ? null : parseChoice(language, value, TASK_CATEGORIES, cliMessages(language).optionLabel.category)),
  changes: (category) => ({ category }),
  label: (task, language) => coreMessages(language).categoryLabel(task.category),
});
