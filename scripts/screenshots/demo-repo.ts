import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);

const VERBS = ["load", "build", "apply", "read", "format", "resolve", "update", "select", "merge", "check", "parse", "map"];
const NOUNS = ["Price", "Order", "Cart", "Item", "Filter", "Session", "Address", "Token", "Invoice", "Plan", "Rate", "Event"];
const HELPERS = ["normalize", "withDefaults", "pickFields", "toCents", "clamp", "sortBy", "groupBy", "withRetry"];
const BLOCK_STEPS = { min: 2, spread: 7 };
const AGENT_TRAILER = "Co-authored-by: Claude <noreply@anthropic.com>";

export const ISOLATED_GIT_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "Demo Developer",
  GIT_AUTHOR_EMAIL: "dev@example.com",
  GIT_COMMITTER_NAME: "Demo Developer",
  GIT_COMMITTER_EMAIL: "dev@example.com",
};

export type Random = () => number;

export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

export class DemoRepo {
  private blockCount = 0;

  constructor(
    readonly dir: string,
    private readonly random: Random,
  ) {}

  async init(files: Readonly<Record<string, number>>, at: Date): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.git(["init", "-q", "-b", "main"]);
    for (const [path, lineCount] of Object.entries(files)) await this.write(path, [this.header(), ...this.blocksOf(lineCount)]);
    await this.commit("chore: initial import", at);
  }

  async appendCode(path: string, lineCount: number): Promise<void> {
    const lines = await this.read(path);
    await this.write(path, [...(lines.length === 0 ? [this.header()] : lines), ...this.blocksOf(lineCount)]);
  }

  async appendTests(sourcePath: string, lineCount: number): Promise<void> {
    const path = join("tests", `${basename(sourcePath, extname(sourcePath))}.test.ts`);
    const lines = await this.read(path);
    const cases = Array.from({ length: lineCount }, () => {
      this.blockCount += 1;
      return `it("case ${this.blockCount}", () => expect(run(${this.blockCount})).toBe(${this.blockCount}));`;
    });
    await this.write(path, [...(lines.length === 0 ? [`import { run } from "../src/run";`] : lines), ...cases]);
  }

  async rewriteLines(path: string, firstLine: number, count: number): Promise<void> {
    const lines = await this.read(path);
    if (firstLine + count - 1 > lines.length) throw new Error(`${path} has ${lines.length} lines, cannot rewrite line ${firstLine}`);
    for (let offset = 0; offset < count; offset++) {
      this.blockCount += 1;
      lines[firstLine - 1 + offset] = `  const revised${this.blockCount} = ${pick(this.random, HELPERS)}(input, ${this.blockCount});`;
    }
    await this.write(path, lines);
  }

  async commit(message: string, at: Date, { byAgent = false }: { byAgent?: boolean } = {}): Promise<string> {
    const iso = at.toISOString();
    await this.git(["add", "-A"]);
    await this.git(["commit", "-q", "-m", message, ...(byAgent ? ["-m", AGENT_TRAILER] : [])], { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
    return (await this.git(["rev-parse", "--short=7", "HEAD"])).trim();
  }

  async switchBranch(branch: string): Promise<void> {
    await this.git(["checkout", "-q", "-B", branch]);
  }

  private header(): string {
    return `import { finish, type Input, type Output } from "./core";`;
  }

  private blocksOf(lineCount: number): string[] {
    const lines: string[] = [];
    while (lines.length < lineCount) lines.push(...this.block());
    return lines;
  }

  private block(): string[] {
    this.blockCount += 1;
    const id = this.blockCount;
    const steps = Array.from({ length: BLOCK_STEPS.min + Math.floor(this.random() * BLOCK_STEPS.spread) }, (_, step) => `  const step${step} = ${pick(this.random, HELPERS)}(input, ${id * 10 + step});`);
    return ["", `export function ${pick(this.random, VERBS)}${pick(this.random, NOUNS)}${id}(input: Input): Output {`, ...steps, "  return finish(step0);", "}"];
  }

  private async read(path: string): Promise<string[]> {
    const text = await readFile(join(this.dir, path), "utf8").catch(() => null);
    return text === null ? [] : text.replace(/\n$/, "").split("\n");
  }

  private async write(path: string, lines: readonly string[]): Promise<void> {
    const target = join(this.dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${lines.join("\n")}\n`, "utf8");
  }

  private async git(args: string[], env: Record<string, string> = {}): Promise<string> {
    const { stdout } = await runFile("git", ["-C", this.dir, ...args], { env: { ...process.env, ...ISOLATED_GIT_ENV, ...env } });
    return stdout;
  }
}
