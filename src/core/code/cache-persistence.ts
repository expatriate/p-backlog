import { contentVersion } from "../store/fs-utils";
import { emptyCodeCache, type CodeCacheSnapshot, type CodeCacheStore } from "./code-cache";
import { fillMissing, snapshotOf, type CodeMemory } from "./code-memory";

type FailureReports = { read: (error: unknown) => void; write: (error: unknown) => void };

export type CachePersistence = { restore: () => Promise<void>; persist: () => Promise<void> };

export function cachePersistence(memory: CodeMemory, store: CodeCacheStore | undefined, reportFailure: FailureReports): CachePersistence {
  let storedFingerprint: string | null = null;
  let restored: Promise<void> | null = null;
  let writing: Promise<void> = Promise.resolve();
  return {
    restore: () => {
      restored ??= readSnapshot(store, reportFailure.read).then((snapshot) => {
        fillMissing(memory, snapshot);
        storedFingerprint = fingerprintOf(snapshotOf(memory));
      });
      return restored;
    },
    persist: () => {
      if (store === undefined) return writing;
      const snapshot = snapshotOf(memory);
      const fingerprint = fingerprintOf(snapshot);
      if (fingerprint === storedFingerprint) return writing;
      storedFingerprint = fingerprint;
      writing = writing.then(() =>
        store.write(snapshot).catch((error: unknown) => {
          storedFingerprint = null;
          reportFailure.write(error);
        }),
      );
      return writing;
    },
  };
}

async function readSnapshot(store: CodeCacheStore | undefined, onError: (error: unknown) => void): Promise<CodeCacheSnapshot> {
  try {
    return (await store?.read()) ?? emptyCodeCache();
  } catch (error) {
    onError(error);
    return emptyCodeCache();
  }
}

function fingerprintOf(snapshot: CodeCacheSnapshot): string {
  return contentVersion(JSON.stringify(snapshot));
}
