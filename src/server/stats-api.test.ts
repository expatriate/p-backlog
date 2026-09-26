import { describe, expect, it } from "vitest";
import type { StatsReport } from "../core/api/contract";
import { statsReport } from "../core/stats/report";
import { readJournals } from "../core/store/journal";
import { loadBacklog, type LoadedBacklog } from "../core/store/load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { createMemorySampler } from "./memory-sampler";
import { serverRu } from "./messages.ru";
import { createStatsApi } from "./stats-api";
import { TEST_NOW } from "./testing/test-app";
import { createUsageScanner } from "./usage-scanner";

describe("кэш отчётов статистики и смена снимка беклога", () => {
  it("снимок, сменившийся между его чтением и записью отчёта в кэш, не отдаётся следующему запросу", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
    const before = await loadBacklog(root);
    await writeFiles(root, { "spa/SPA-2.md": taskFile("SPA-2") });
    const after = await loadBacklog(root);
    let current: LoadedBacklog = before;
    const stats = createStatsApi({
      root,
      home: root,
      now: () => TEST_NOW,
      readLanguage: async () => "ru",
      usage: createUsageScanner({ root, claudeProjectsDir: await makeTempDir(), messages: async () => serverRu, warn: () => undefined }),
      memory: createMemorySampler(),
      warn: () => undefined,
      backlog: async () => {
        const read = current;
        if (read === before) {
          current = after;
          stats.forget();
        }
        return read;
      },
    });

    await stats.routes.request("/stats");
    const report = (await (await stats.routes.request("/stats")).json()) as StatsReport;

    const fromScratch = statsReport({ tasks: after.tasks, journals: await readJournals(root, ["spa"]), now: TEST_NOW, unparsedTasks: [] });
    expect(report).toEqual(JSON.parse(JSON.stringify(fromScratch)));
  });
});
