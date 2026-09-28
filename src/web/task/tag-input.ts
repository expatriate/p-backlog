import { normalizeTags } from "../../core/model/types";

export function parseTagInput(value: string): string[] {
  return normalizeTags(value.split(","));
}

export function canonicalTags(value: string): string {
  return parseTagInput(value).join(", ");
}
