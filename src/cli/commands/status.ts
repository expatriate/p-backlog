import { checklistItems } from "../../core/model/checklist";
import { TASK_STATUSES } from "../../core/model/types";
import { parseChoice } from "../io";
import { cliMessages } from "../messages";
import { taskFieldCommand } from "../task-field-command";

export const statusCommand = taskFieldCommand({
  name: "status",
  choices: TASK_STATUSES.join("|"),
  parse: (language, value) => parseChoice(language, value, TASK_STATUSES, cliMessages(language).optionLabel.status),
  changes: (status) => ({ status }),
  label: (task) => task.status,
  afterWrite: (task, io) => {
    const uncheckedCount = checklistItems(task.body).filter((item) => !item.checked).length;
    if (task.status === "done" && uncheckedCount > 0) io.warn(cliMessages(io.language).checklistWarning(uncheckedCount));
  },
});
