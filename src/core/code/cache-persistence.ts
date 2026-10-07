import { contentVersion } from "../store/fs-utils";
import { emptyCodeCache, type CodeCacheErrorKind, type CodeCacheSnapshot, type CodeCacheStore } from "./code-cache";
import { fillMissing, snapshotOf, type CodeMemory } from "./code-memory";

export type CachePersistence = { restore: () => Promise<void>; persist: () => Promise<void> };

export function cachePersistence(memory: CodeMemory, store: CodeCacheStore | undefined, onError: (kind: CodeCacheErrorKind, error: unknown) => void): CachePersistence {
  let storedFingerprint: string | null = null;
  let restored: Promise<void> | null = null;
  let writing: Promise<void> = Promise.resolve();
  return {
    restore: () => {
      restored ??= readSnapshot(store, onError).then((snapshot) => {
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
          onError("write", error);
        }),
      );
      return writing;
    },
  };
}

async function readSnapshot(store: CodeCacheStore | undefined, onError: (kind: CodeCacheErrorKind, error: unknown) => void): Promise<CodeCacheSnapshot> {
  try {
    return (await store?.read()) ?? emptyCodeCache();
  } catch (error) {
    onError("read", error);
    return emptyCodeCache();
  }
}

function fingerprintOf(snapshot: CodeCacheSnapshot): string {
  return contentVersion(JSON.stringify(snapshot));
}
