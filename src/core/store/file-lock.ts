import { randomUUID } from "node:crypto";
import { rm, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { errorCode, hasErrorCode, type PathErrorHandler } from "../errors";
import { SECOND_MS } from "../model/dates";
import type { AfterPublish } from "./atomic-write";
import { blockedOnWindows, onWindows, readTextOrNull, retryWhileBlockedOnWindows, statOrNull } from "./fs-utils";

const RETRY_MS = 10;
const ABANDONED_AFTER_MS = 30_000;
const ABANDONED_BREAK_AFTER_MS = 2 * SECOND_MS;
const REFRESH_EVERY_MS = ABANDONED_AFTER_MS / 3;
const DEFAULT_WAIT_LIMIT_MS = 5_000;
const REFUSED_AT_LEAST_MS = SECOND_MS;

export type LockOptions = { waitLimitMs?: number | undefined };

export type LockBusy = { path: string; lock: string; seconds: number };

export class FileBusyError extends Error implements LockBusy {
  constructor(
    readonly path: string,
    readonly lock: string,
    readonly seconds: number,
  ) {
    super(`${path} is locked: ${lock}`);
    this.name = "FileBusyError";
  }
}

type HeldLock = { path: string; lock: string; token: string; stopRefreshing: () => Promise<void> };

class Refusal {
  constructor(readonly error: unknown) {}
}

type CreateOutcome = "created" | "exists" | Refusal;

type Holder = { token: string; changedAt: number };

type HolderOutcome = Holder | Refusal | null;

export function lockPathOf(path: string): string {
  return join(dirname(path), `.${basename(path)}.lock`);
}

export async function withWriteLock<T>(path: string, write: (afterPublish: AfterPublish) => Promise<T>, { onErrorAfterPublish, ...options }: AfterPublish & LockOptions): Promise<T> {
  const held = await acquire(path, options);
  if (held instanceof Refusal) throw held.error;
  return releasingAfter([held], () => write({ onErrorAfterPublish }), onErrorAfterPublish);
}

export async function withAvailableLocks<T>(
  paths: readonly string[],
  action: (locked: ReadonlySet<string>) => Promise<T>,
  { waitLimitMs = DEFAULT_WAIT_LIMIT_MS, onErrorAfterPublish }: AfterPublish & LockOptions,
): Promise<T> {
  const held: HeldLock[] = [];
  const giveUpAt = Date.now() + waitLimitMs;
  return releasingAfter(
    held,
    async () => {
      for (const path of [...paths].sort()) {
        try {
          const acquired = await acquire(path, { waitLimitMs: giveUpAt - Date.now() });
          if (!(acquired instanceof Refusal)) held.push(acquired);
        } catch (error) {
          if (!(error instanceof FileBusyError)) throw error;
        }
      }
      return action(new Set(held.map(({ path }) => path)));
    },
    onErrorAfterPublish,
  );
}

async function releasingAfter<T>(held: readonly HeldLock[], action: () => Promise<T>, onErrorAfterPublish: PathErrorHandler): Promise<T> {
  let outcome: T;
  try {
    outcome = await action();
  } catch (error) {
    const [failure] = await releaseFailures(held);
    throw failure === undefined ? error : failure.error;
  }
  for (const { path, error } of await releaseFailures(held)) onErrorAfterPublish(path, error);
  return outcome;
}

type ReleaseFailure = { path: string; error: unknown };

async function releaseFailures(held: readonly HeldLock[]): Promise<ReleaseFailure[]> {
  const failures = await Promise.all(
    held.map((lock) =>
      release(lock).then(
        (): ReleaseFailure[] => [],
        (error: unknown) => [{ path: lock.path, error }],
      ),
    ),
  );
  return failures.flat();
}

type RefusalStreak = { refusal: Refusal; since: number };

async function acquire(path: string, { waitLimitMs = DEFAULT_WAIT_LIMIT_MS }: LockOptions): Promise<HeldLock | Refusal> {
  const lock = lockPathOf(path);
  const token = `${process.pid} ${randomUUID()}`;
  const giveUpAt = Date.now() + waitLimitMs;
  let streak: RefusalStreak | null = null;
  for (;;) {
    const created = await tryCreate(lock, token);
    if (created === "created") return { path, lock, token, stopRefreshing: keepRefreshed(lock, token) };
    const holder = await holderOf(lock);
    const abandoned = tokenIfAbandoned(holder, ABANDONED_AFTER_MS);
    if (abandoned !== null && (await breakAbandoned(lock, abandoned))) {
      streak = null;
      continue;
    }
    const refusal = refusalBehind(created, holder);
    streak = extended(streak, refusal);
    if (Date.now() > giveUpAt) {
      if (streak !== null && Date.now() - streak.since >= REFUSED_AT_LEAST_MS) return streak.refusal;
      throw new FileBusyError(path, lock, waitLimitMs / SECOND_MS);
    }
    await sleep(RETRY_MS);
  }
}

function extended(streak: RefusalStreak | null, refusal: Refusal | null): RefusalStreak | null {
  return refusal === null ? null : { refusal, since: streak?.since ?? Date.now() };
}

function refusalBehind(created: Exclude<CreateOutcome, "created">, holder: HolderOutcome): Refusal | null {
  if (holder instanceof Refusal) return holder;
  return holder === null && created instanceof Refusal ? created : null;
}

async function tryCreate(lock: string, token: string): Promise<CreateOutcome> {
  try {
    await writeFile(lock, token, { flag: "wx" });
    return "created";
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) return "exists";
    if (deletePendingOnWindows(error)) return new Refusal(error);
    throw error;
  }
}

function deletePendingOnWindows(error: unknown): boolean {
  return onWindows() && hasErrorCode(error, "EPERM");
}

async function holderOf(path: string): Promise<HolderOutcome> {
  try {
    const token = await readTextOrNull(path);
    if (token === null) return null;
    const info = await statOrNull(path);
    return info === null ? null : { token, changedAt: info.mtimeMs };
  } catch (error) {
    if (blockedOnWindows(error)) return new Refusal(error);
    throw error;
  }
}

function tokenIfAbandoned(holder: HolderOutcome, abandonedAfterMs: number): string | null {
  if (holder === null || holder instanceof Refusal) return null;
  return Date.now() - holder.changedAt > abandonedAfterMs ? holder.token : null;
}

async function abandonedToken(path: string, abandonedAfterMs: number): Promise<string | null> {
  return tokenIfAbandoned(await holderOf(path), abandonedAfterMs);
}

async function breakAbandoned(lock: string, abandoned: string): Promise<boolean> {
  const breaker = `${lock}.break`;
  if ((await tryCreate(breaker, abandoned)) !== "created") {
    if ((await abandonedToken(breaker, ABANDONED_BREAK_AFTER_MS)) !== null) await removeUnlessBlocked(breaker);
    return false;
  }
  try {
    if ((await abandonedToken(lock, ABANDONED_AFTER_MS)) !== abandoned) return false;
    return await removeUnlessBlocked(lock);
  } finally {
    await removeUnlessBlocked(breaker);
  }
}

function removeUnlessBlocked(path: string): Promise<boolean> {
  return orWhenBlocked(
    rm(path, { force: true }).then(() => true),
    false,
  );
}

async function orWhenBlocked<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (blockedOnWindows(error)) return fallback;
    throw error;
  }
}

function keepRefreshed(lock: string, token: string): () => Promise<void> {
  let bug: unknown = null;
  let refreshing = Promise.resolve();
  const timer = setInterval(() => {
    refreshing = refreshing
      .then(() => refreshIfHeld(lock, token))
      .catch((error: unknown) => {
        clearInterval(timer);
        if (errorCode(error) === undefined) bug = error;
      });
  }, REFRESH_EVERY_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await refreshing;
    if (bug !== null) throw bug;
  };
}

async function refreshIfHeld(lock: string, token: string): Promise<void> {
  if ((await readTextOrNull(lock)) !== token) return;
  const now = new Date();
  try {
    await utimes(lock, now, now);
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }
}

async function release({ lock, token, stopRefreshing }: HeldLock): Promise<void> {
  await stopRefreshing();
  await orWhenBlocked(
    retryWhileBlockedOnWindows(async () => {
      if ((await readTextOrNull(lock)) === token) await rm(lock, { force: true });
    }),
    undefined,
  );
}
