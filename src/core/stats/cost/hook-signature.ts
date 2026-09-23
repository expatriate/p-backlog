import type { Language } from "../../i18n/language";

export const HOOK_STOP_EVENT = "stop";
export const HOOK_STOP_COMMAND = `hook ${HOOK_STOP_EVENT}`;

const STOP_HOOK_FEEDBACK_PREFIX = "Stop hook feedback:";
const HOOK_MESSAGE_MARK: Record<Language, string> = { ru: "Беклог", en: "Backlog" };

export function hookMessage(language: Language, projectId: string, text: string): string {
  return `${HOOK_MESSAGE_MARK[language]} ${projectId}: ${text}`;
}

export function isBacklogHookFeedback(text: string): boolean {
  return text.startsWith(STOP_HOOK_FEEDBACK_PREFIX) && Object.values(HOOK_MESSAGE_MARK).some((mark) => text.includes(`${mark} `));
}
