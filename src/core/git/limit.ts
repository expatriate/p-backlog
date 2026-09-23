export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(maxRunning: number): Limiter {
  let running = 0;
  const waiting: (() => void)[] = [];

  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) running--;
    else next();
  };

  const acquire = (): Promise<void> => {
    if (running < maxRunning) {
      running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };

  return async (task) => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}
