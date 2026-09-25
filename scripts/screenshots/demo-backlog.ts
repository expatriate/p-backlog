import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { execProgram } from "../../src/cli/exec";
import { runCli } from "../../src/cli/run";
import type { Language } from "../../src/core/i18n/language";
import { coreMessages } from "../../src/core/messages";
import { DAY_MS } from "../../src/core/model/lifecycle";
import { serializeProject } from "../../src/core/model/project-file";
import { PRIORITIES, TASK_CATEGORIES } from "../../src/core/model/types";
import { PROJECT_FILE } from "../../src/core/store/paths";
import { writeSettings } from "../../src/core/store/settings";
import { sweepClosed } from "../../src/core/store/sweep";
import { DemoRepo, pick, seededRandom, type Random } from "./demo-repo";

const eventSchema = z.discriminatedUnion("do", [
  z.object({ at: z.number(), do: z.enum(["take", "done", "cancel", "block", "reopen", "verify", "touch", "obsolete"]) }),
  z.object({ at: z.number(), do: z.literal("priority"), to: z.enum(PRIORITIES) }),
  z.object({ at: z.number(), do: z.literal("duplicate"), of: z.string() }),
  z.object({ at: z.number(), do: z.literal("fix"), lines: z.number().int().positive(), tests: z.number().int().nonnegative().default(0), agent: z.boolean().default(false) }),
]);

const taskSchema = z.object({
  key: z.string(),
  project: z.string(),
  created: z.number(),
  type: z.enum(["task", "epic"]).default("task"),
  category: z.enum(TASK_CATEGORIES).optional(),
  priority: z.enum(PRIORITIES),
  tags: z.array(z.string()).default([]),
  source: z.string().optional(),
  epic: z.string().optional(),
  blockedBy: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  found: z.enum(["review", "incidental"]).optional(),
  branch: z.string().optional(),
  force: z.boolean().default(false),
  events: z.array(eventSchema).default([]),
});

const scenarioSchema = z.object({
  startDaysAgo: z.number(),
  repoCreatedDaysAgo: z.number(),
  checkEveryDays: z.number().positive(),
  projects: z.array(z.object({ id: z.string(), prefix: z.string(), commitsPerDay: z.number(), files: z.record(z.string(), z.number().int().positive()) })),
  tasks: z.array(taskSchema),
});

const textsSchema = z.object({
  fixReason: z.string(),
  tasks: z.record(z.string(), z.object({ title: z.string(), body: z.string().optional(), reason: z.string().optional() })),
});

type Scenario = z.infer<typeof scenarioSchema>;
type ScenarioTask = z.infer<typeof taskSchema>;
type TaskEvent = z.infer<typeof eventSchema>;
type Texts = z.infer<typeof textsSchema>;

export type DemoPaths = { home: string; backlogRoot: string };
export type DemoBacklog = { idOf: (key: string) => string };

type Step = { at: number; run: () => Promise<unknown> };

const WORK_START_HOUR = 10;
const WORK_HOURS = 8;
const CLOSING_HOUR = 20;
const MINUTES_PER_HOUR = 60;
const MINUTE_MS = 60_000;
const CHECK_AFTER_TOUCH_DAYS = 0.02;
const SEED = 20260924;
const CHECK_EXIT_CODES = [0, 5];
const FIX_REWRITTEN_LINES = 3;
const NUMSTAT_LINES_PER_REWRITTEN_LINE = 2;
const FEATURE_LINES = { min: 6, spread: 30 };
const FEATURE_TEST_LINES = { min: 3, spread: 10 };
const FEATURE_WITH_TESTS_SHARE = 0.25;
const COMMITS_PER_DAY_JITTER = { min: 0.4, spread: 1.2 };
const SUNDAY = 0;
const SATURDAY = 6;

export async function readDemoInputs(dataDir: string, language: Language): Promise<{ scenario: Scenario; texts: Texts }> {
  const readJson = async (name: string) => JSON.parse(await readFile(join(dataDir, name), "utf8")) as unknown;
  return {
    scenario: scenarioSchema.parse(await readJson("scenario.json")),
    texts: textsSchema.parse(await readJson(`demo-data.${language}.json`)),
  };
}

export async function buildDemoBacklog(scenario: Scenario, texts: Texts, language: Language, paths: DemoPaths, repoRoot: string): Promise<DemoBacklog> {
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * DAY_MS);
  const random = seededRandom(SEED);
  const ids = new Map<string, string>();
  const idOf = (key: string): string => {
    const id = ids.get(key);
    if (id === undefined) throw new Error(`Task "${key}" is used before it is created`);
    return id;
  };
  const textOf = (key: string) => {
    const text = texts.tasks[key];
    if (text === undefined) throw new Error(`No ${language} text for task "${key}"`);
    return text;
  };

  await writeSettings(paths.backlogRoot, { language });
  const repos = new Map<string, DemoRepo>();
  for (const project of scenario.projects) {
    const repo = new DemoRepo(join(paths.home, "projects", project.id), random);
    await repo.init(project.files, daysAgo(scenario.repoCreatedDaysAgo));
    repos.set(project.id, repo);
    await mkdir(join(paths.backlogRoot, project.id), { recursive: true });
    const text = serializeProject({ name: project.id, prefix: project.prefix, repos: [`~/projects/${project.id}`], issuedUpTo: undefined, active: true, extra: {}, body: "" });
    await writeFile(join(paths.backlogRoot, project.id, PROJECT_FILE), text, "utf8");
  }
  const repoOf = (projectId: string): DemoRepo => {
    const repo = repos.get(projectId);
    if (repo === undefined) throw new Error(`Unknown project "${projectId}"`);
    return repo;
  };

  let clock = new Date(now);
  const cli = async (argv: string[], { cwd = paths.backlogRoot, stdin = "", allowed = [0] }: { cwd?: string; stdin?: string; allowed?: number[] } = {}): Promise<string> => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(argv, {
      cwd,
      home: paths.home,
      backlogRoot: paths.backlogRoot,
      packageRoot: repoRoot,
      platform: process.platform,
      uid: process.getuid?.() ?? 0,
      nodePath: process.execPath,
      cliPath: join(repoRoot, "dist/cli.js"),
      exec: execProgram,
      stopProcess: () => false,
      env: {},
      now: () => clock,
      readStdin: async () => stdin,
      print: (line) => out.push(line),
      warn: (line) => err.push(line),
    });
    if (!allowed.includes(code)) throw new Error(`backlog ${argv.join(" ")} exited with ${code}:\n${err.join("\n")}`);
    return out.join("\n");
  };

  const touchedBy = new Map<string, string>();
  const sourceOf = (task: ScenarioTask): { path: string; line: number } => {
    const match = /^(?<path>.+):(?<line>\d+)$/.exec(task.source ?? "");
    if (match?.groups?.path === undefined || match.groups.line === undefined) throw new Error(`Task "${task.key}" needs a file:line source`);
    return { path: match.groups.path, line: Number(match.groups.line) };
  };

  const createTask = async (task: ScenarioTask): Promise<void> => {
    const repo = repoOf(task.project);
    const text = textOf(task.key);
    if (task.branch !== undefined) await repo.switchBranch(task.branch);
    const options: [string, string | undefined][] = [
      ["--title", text.title],
      ["--type", task.type],
      ["--priority", task.priority],
      ["--category", task.category],
      ["--tags", task.tags.length > 0 ? task.tags.join(",") : undefined],
      ["--found", task.found],
      ["--source", task.source],
      ["--epic", task.epic === undefined ? undefined : idOf(task.epic)],
      ["--blocked-by", task.blockedBy.length > 0 ? task.blockedBy.map(idOf).join(",") : undefined],
      ["--related", task.related.length > 0 ? task.related.map(idOf).join(",") : undefined],
      ["--project", task.project],
    ];
    const argv = ["new", ...options.flatMap(([flag, value]) => (value === undefined ? [] : [flag, value])), ...(task.force ? ["--force"] : [])];
    const output = await cli(argv, { cwd: repo.dir, stdin: text.body ?? "" });
    if (task.branch !== undefined) await repo.switchBranch("main");
    const id = output.split(" ")[0];
    if (id === undefined || id === "") throw new Error(`backlog new printed no id for "${task.key}"`);
    ids.set(task.key, id);
  };

  const closeWithReason = (task: ScenarioTask, resolution: string, reason: string, extra: string[] = []) =>
    cli(["close", idOf(task.key), "--as", resolution, "--reason", reason, ...extra]);

  const reasonOf = (task: ScenarioTask): string => {
    const reason = textOf(task.key).reason;
    if (reason === undefined) throw new Error(`Task "${task.key}" needs a ${language} closing reason`);
    return reason;
  };

  const applyEvent = async (task: ScenarioTask, event: TaskEvent): Promise<void> => {
    const id = idOf(task.key);
    const repo = repoOf(task.project);
    switch (event.do) {
      case "take":
        await cli(["take", id]);
        return;
      case "done":
        await cli(["status", id, "done"]);
        return;
      case "cancel":
        await cli(["status", id, "cancelled"]);
        return;
      case "block":
        await cli(["status", id, "blocked"]);
        return;
      case "reopen":
        await cli(["status", id, "backlog"]);
        return;
      case "verify":
        await cli(["verify", id]);
        return;
      case "priority":
        await cli(["priority", id, event.to]);
        return;
      case "touch": {
        const source = sourceOf(task);
        await repo.rewriteLines(source.path, source.line, 1);
        touchedBy.set(task.key, await repo.commit(`refactor: reshape ${source.path}`, clock));
        return;
      }
      case "obsolete": {
        const commit = touchedBy.get(task.key) ?? "";
        await closeWithReason(task, "obsolete", reasonOf(task).replace("{commit}", commit));
        return;
      }
      case "duplicate": {
        const original = idOf(event.of);
        await closeWithReason(task, "duplicate", reasonOf(task).replace("{original}", original), ["--duplicate-of", original]);
        return;
      }
      case "fix": {
        const source = sourceOf(task);
        await repo.rewriteLines(source.path, source.line, FIX_REWRITTEN_LINES);
        await repo.appendCode(source.path, Math.max(0, event.lines - event.tests - FIX_REWRITTEN_LINES * NUMSTAT_LINES_PER_REWRITTEN_LINE));
        if (event.tests > 0) await repo.appendTests(source.path, event.tests);
        const commit = await repo.commit(`fix: ${task.key}`, clock, { byAgent: event.agent });
        await closeWithReason(task, "fixed", (textOf(task.key).reason ?? texts.fixReason).replace("{commit}", commit));
        return;
      }
    }
  };

  const steps: Step[] = scenario.projects.flatMap((project) => featureCommitSteps(repoOf(project.id), project, random, now, scenario.repoCreatedDaysAgo));
  const at = (days: number, run: () => Promise<unknown>) => steps.push({ at: now - days * DAY_MS, run });

  const check = () => cli(["check", "--all-projects"], { allowed: CHECK_EXIT_CODES });
  for (const task of scenario.tasks) {
    at(task.created, () => createTask(task));
    if (task.force) at(task.created - CHECK_AFTER_TOUCH_DAYS, check);
    for (const event of task.events) {
      at(event.at, () => applyEvent(task, event));
      if (event.do === "touch") at(event.at - CHECK_AFTER_TOUCH_DAYS, check);
    }
  }

  const messages = coreMessages(language);
  for (let day = Math.floor(scenario.startDaysAgo); day >= 1; day--) {
    const evening = eveningOf(now, day);
    steps.push({ at: evening, run: () => sweepClosed(paths.backlogRoot, new Date(evening), messages) });
    if (day % scenario.checkEveryDays === 0) {
      steps.push({ at: evening + 1, run: check });
    }
  }

  const ordered = steps.map((step, index) => ({ ...step, index })).sort((a, b) => a.at - b.at || a.index - b.index);
  for (const step of ordered) {
    clock = new Date(step.at);
    await step.run();
  }
  return { idOf };
}

function featureCommitSteps(repo: DemoRepo, project: Scenario["projects"][number], random: Random, now: number, repoCreatedDaysAgo: number): Step[] {
  const files = Object.keys(project.files);
  const steps: Step[] = [];
  for (let day = Math.floor(repoCreatedDaysAgo) - 1; day >= 0; day--) {
    for (const moment of workMoments(random, now, day, project.commitsPerDay)) {
      const path = pick(random, files);
      const lineCount = FEATURE_LINES.min + Math.floor(random() * FEATURE_LINES.spread);
      const withTests = random() < FEATURE_WITH_TESTS_SHARE;
      steps.push({
        at: moment,
        run: async () => {
          await repo.appendCode(path, lineCount);
          if (withTests) await repo.appendTests(path, FEATURE_TEST_LINES.min + Math.floor(random() * FEATURE_TEST_LINES.spread));
          await repo.commit(`feat: extend ${path}`, new Date(moment));
        },
      });
    }
  }
  return steps;
}

function workMoments(random: Random, now: number, day: number, perDay: number): number[] {
  const date = new Date(now - day * DAY_MS);
  const weekday = date.getDay();
  if (weekday === SUNDAY || weekday === SATURDAY) return [];
  const count = Math.floor(perDay * (COMMITS_PER_DAY_JITTER.min + random() * COMMITS_PER_DAY_JITTER.spread) + random());
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), WORK_START_HOUR).getTime();
  return Array.from({ length: count }, () => start + Math.floor(random() * WORK_HOURS * MINUTES_PER_HOUR) * MINUTE_MS)
    .filter((moment) => moment < now)
    .sort((a, b) => a - b);
}

function eveningOf(now: number, day: number): number {
  const date = new Date(now - day * DAY_MS);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), CLOSING_HOUR).getTime();
}
