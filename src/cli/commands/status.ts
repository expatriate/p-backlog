import { checklistItems } from "../../core/model/checklist";
import { isClosed } from "../../core/model/graph";
import { TASK_STATUSES } from "../../core/model/types";
import { reasonHashes } from "../../core/stats/code/fixes";
import { parseChoice } from "../io";
import { cliMessages } from "../messages";
import { taskFieldCommand } from "../task-field-command";

export const statusCommand = taskFieldCommand({
  name: "status",
  choices: TASK_STATUSES.join("|"),
  parse: (language, value) => parseChoice(language, value, TASK_STATUSES, cliMessages(language).optionLabel.status),
  changes: (status) => ({ status }),
  label: (task) => task.status,
  afterWrite: (task, io, before) => {
    const uncheckedCount = checklistItems(task.body).filter((item) => !item.checked).length;
    if (task.status === "done" && uncheckedCount > 0) io.warn(io.cli.checklistWarning(uncheckedCount));
    if (task.type === "task" && task.status === "done" && !isClosed(before.status)) io.warn(io.cli.closedWithoutFixCommit(task.id));
    const previousFixes = before.resolution === "fixed" ? reasonHashes(before.reason) : [];
    if (!isClosed(task.status) && previousFixes.length > 0) io.warn(io.cli.earlierFixCommits(task.id, previousFixes));
  },
});
