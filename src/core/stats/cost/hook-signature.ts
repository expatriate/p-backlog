import { LANGUAGES, type Language } from "../../i18n/language";
import { coreMessages } from "../../messages";

export const HOOK_STOP_EVENT = "stop";
export const HOOK_STOP_COMMAND = `hook ${HOOK_STOP_EVENT}`;

const STOP_HOOK_FEEDBACK_PREFIX = "Stop hook feedback:";

export function hookMessage(language: Language, projectId: string, text: string): string {
  return `${coreMessages(language).hookMark} ${projectId}: ${text}`;
}

export function isBacklogHookFeedback(text: string): boolean {
  return text.startsWith(STOP_HOOK_FEEDBACK_PREFIX) && LANGUAGES.some((language) => text.includes(`${coreMessages(language).hookMark} `));
}
