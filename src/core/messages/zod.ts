import type { z } from "zod";
import type { StoredZodIssue } from "../model/problems";

type LocaleError = NonNullable<z.core.$ZodConfig["localeError"]>;

const TYPE_WITNESSES: Record<string, unknown> = {
  number: 0,
  nan: Number.NaN,
  string: "",
  boolean: false,
  bigint: 0n,
  symbol: Symbol(),
  function: () => undefined,
  undefined: undefined,
  null: null,
  array: [],
  object: {},
};

export function zodIssueText(localeError: LocaleError, { issue, receivedType }: StoredZodIssue): string {
  const input = receivedType === undefined ? undefined : witnessOf(receivedType);
  const text = localeError({ ...issue, input } as z.core.$ZodRawIssue);
  return typeof text === "string" ? text : (text?.message ?? issue.message);
}

// zod locales name the received type from the input value (constructor.name for objects); only the type name is stored, so a stand-in value carries it.
function witnessOf(type: string): unknown {
  return type in TYPE_WITNESSES ? TYPE_WITNESSES[type] : Object.create({ constructor: { name: type } });
}
