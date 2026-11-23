import { parseProbabilityValue } from "../io";
import { taskFieldCommand } from "../task-field-command";

const NO_PROBABILITY = "none";

export const probabilityCommand = taskFieldCommand({
  name: "probability",
  choices: `0..100|${NO_PROBABILITY}`,
  parse: (language, value) => (value === NO_PROBABILITY ? null : parseProbabilityValue(language, value)),
  changes: (probability) => ({ probability }),
  label: (task) => (task.probability === undefined ? "—" : `${task.probability}%`),
});
