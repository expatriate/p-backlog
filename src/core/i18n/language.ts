export const LANGUAGES = ["ru", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export function languageFromLocale(locale: string | undefined): Language {
  return locale?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function localeOf(language: Language): "ru-RU" | "en-US" {
  return language === "ru" ? "ru-RU" : "en-US";
}
