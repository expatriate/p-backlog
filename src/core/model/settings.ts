import { z } from "zod";
import { LANGUAGES } from "../i18n/language";

export const settingsSchema = z.object({ language: z.enum(LANGUAGES) });

export type Settings = z.infer<typeof settingsSchema>;
