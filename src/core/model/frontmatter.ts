import { errorText } from "../errors";
import { Document, parse, visit } from "yaml";
import type { z } from "zod";
import { parseSchema } from "./zod-issues";
import type { ParseResult } from "./types";

const DELIMITER = "---";

export type FrontmatterParts<T> = { data: T; extra: Record<string, unknown>; body: string };

export function parseFrontmatter<Shape extends z.core.$ZodShape>(
  text: string,
  schema: z.ZodObject<Shape>,
): ParseResult<FrontmatterParts<z.output<z.ZodObject<Shape>>>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== DELIMITER) return { ok: false, problems: [{ code: "no-frontmatter" }] };
  const closing = lines.indexOf(DELIMITER, 1);
  if (closing === -1) return { ok: false, problems: [{ code: "frontmatter-unclosed" }] };

  let raw: unknown;
  try {
    raw = parse(lines.slice(1, closing).join("\n"));
  } catch (error) {
    return { ok: false, problems: [{ code: "yaml", detail: errorText(error) }] };
  }

  const parsed = parseSchema(schema, raw);
  if (!parsed.ok) return parsed;

  const knownFields = Object.keys(schema.shape);
  const extra = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([key]) => !knownFields.includes(key)));
  const body = lines.slice(closing + 1).join("\n").replace(/^\n+/, "");
  return { ok: true, value: { data: parsed.value, extra, body } };
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const document = new Document(data);
  visit(document, {
    Seq(_, node) {
      node.flow = true;
    },
  });
  const yamlText = document.toString({ lineWidth: 0, flowCollectionPadding: false });
  const content = body.replace(/^\n+/, "").trimEnd();
  return content === "" ? `${DELIMITER}\n${yamlText}${DELIMITER}\n` : `${DELIMITER}\n${yamlText}${DELIMITER}\n\n${content}\n`;
}
