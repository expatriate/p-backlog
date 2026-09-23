export const HOOK_STOP_EVENT = "stop";
export const HOOK_STOP_COMMAND = `hook ${HOOK_STOP_EVENT}`;

const STOP_HOOK_FEEDBACK_PREFIX = "Stop hook feedback:";
const HOOK_MESSAGE_MARK = "Беклог";

export function hookMessage(projectId: string, text: string): string {
  return `${HOOK_MESSAGE_MARK} ${projectId}: ${text}`;
}

export function isBacklogHookFeedback(text: string): boolean {
  return text.startsWith(STOP_HOOK_FEEDBACK_PREFIX) && text.includes(`${HOOK_MESSAGE_MARK} `);
}
