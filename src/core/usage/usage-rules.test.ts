import { writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { modelKey, pricedModelIds } from "../stats/cost/pricing";
import { ZERO_TOKENS } from "../stats/cost/token-counts";
import { usageBucketSchema, type UsageBucket } from "../stats/cost/usage-state";
import { jsonFileText, readJsonFile } from "../store/json-file";
import { listTranscripts, scanTranscripts } from "./transcripts";
import { emptyUsageCache, USAGE_CACHE_VERSION } from "./usage-cache";

const TESTING_DIR = join(import.meta.dirname, "testing");
const REFERENCE_DIR = join(TESTING_DIR, "reference-transcripts");
const PINNED_FILE = join(TESTING_DIR, "usage-rules.pinned.json");
const NOW = new Date("2026-11-11T12:00:00Z");
const BYTE_BUDGET = 10_000_000;
const PROMPT_TOKEN_PROBES = [1_000, 50_000, 100_000, 100_001, 150_000, 200_000, 500_000, 1_000_000];
const PIN_ENV = "PIN_USAGE_RULES";
const PIN_COMMAND = `${PIN_ENV}=1 npx vitest run ${relative(process.cwd(), import.meta.filename)}`;

const usageRulesSchema = z.object({ buckets: z.record(z.string(), z.array(usageBucketSchema)), longPromptKeys: z.record(z.string(), z.record(z.string(), z.string())) });

const pinnedRulesSchema = usageRulesSchema.extend({ usageCacheVersion: z.number() });

type UsageRules = z.infer<typeof usageRulesSchema>;

async function currentUsageRules(): Promise<UsageRules> {
  return { buckets: await countedReferenceBuckets(), longPromptKeys: longPromptKeys() };
}

async function countedReferenceBuckets(): Promise<Record<string, UsageBucket[]>> {
  const files = await listTranscripts(TESTING_DIR);
  const { cache } = await scanTranscripts({ files, cache: emptyUsageCache(), byteBudget: BYTE_BUDGET, now: NOW });
  return Object.fromEntries(Object.entries(cache.files).map(([path, entry]) => [basename(path), entry.buckets.toSorted(byContent)]));
}

function byContent(a: UsageBucket, b: UsageBucket): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function longPromptKeys(): Record<string, Record<string, string>> {
  return Object.fromEntries(
    pricedModelIds().flatMap((model) => {
      const keyed = PROMPT_TOKEN_PROBES.map((input) => [String(input), modelKey({ model, fast: false, tokens: { ...ZERO_TOKENS, input } })] as const).filter(([, key]) => key !== model);
      return keyed.length === 0 ? [] : [[model, Object.fromEntries(keyed)]];
    }),
  );
}

async function readPinned(): Promise<z.infer<typeof pinnedRulesSchema>> {
  const pinned = await readJsonFile(PINNED_FILE, pinnedRulesSchema);
  if (pinned === null) throw new Error(`${relative(process.cwd(), PINNED_FILE)} не читается как снимок правил учёта: верните его из git и перезакрепите: ${PIN_COMMAND}`);
  return pinned;
}

function rulesChangedMessage(pinnedVersion: number): string {
  return [
    `Правила учёта изменили ключи корзин: корзины эталонных расшифровок (${relative(process.cwd(), REFERENCE_DIR)}) или модели с отдельным тарифом длинного запроса в таблице цен. А USAGE_CACHE_VERSION осталась ${pinnedVersion}.`,
    "Кэш пользователя хранит корзины, посчитанные по прежним правилам, и без смены версии так их и покажет.",
    `Поднимите USAGE_CACHE_VERSION в src/core/usage/usage-cache.ts до ${pinnedVersion + 1}: живые расшифровки пересчитаются, вклад удалённых перенесётся как есть.`,
    `Затем перезакрепите снимок: ${PIN_COMMAND}`,
  ].join("\n");
}

it("ключи и корзины учёта меняются только вместе с USAGE_CACHE_VERSION", async () => {
  const current = await currentUsageRules();
  const { usageCacheVersion, ...pinned } = await readPinned();

  if (usageCacheVersion === USAGE_CACHE_VERSION) expect(current, rulesChangedMessage(usageCacheVersion)).toEqual(pinned);
  if (process.env[PIN_ENV] === "1") await writeFile(PINNED_FILE, jsonFileText({ usageCacheVersion: USAGE_CACHE_VERSION, ...current }), "utf8");
  else expect(usageCacheVersion, `USAGE_CACHE_VERSION = ${USAGE_CACHE_VERSION}, а снимок правил учёта закреплён за версией ${usageCacheVersion}. Перезакрепите снимок: ${PIN_COMMAND}`).toBe(USAGE_CACHE_VERSION);
});
