import { vi } from "vitest";

type Injection = { code?: string; meanwhile?: () => Promise<unknown> };

export function failingOnce<A extends unknown[], R, T>(target: (...args: A) => Promise<R>, matches: (...args: A) => boolean, action: () => Promise<T>, injection: Injection = {}): Promise<T> {
  return failing(target, matches, action, injection, { once: true });
}

export function failingEvery<A extends unknown[], R, T>(target: (...args: A) => Promise<R>, matches: (...args: A) => boolean, action: () => Promise<T>, injection: Injection = {}): Promise<T> {
  return failing(target, matches, action, injection, { once: false });
}

async function failing<A extends unknown[], R, T>(
  target: (...args: A) => Promise<R>,
  matches: (...args: A) => boolean,
  action: () => Promise<T>,
  { code = "EIO", meanwhile = async () => {} }: Injection,
  { once }: { once: boolean },
): Promise<T> {
  const mocked = vi.mocked(target);
  const actual = mocked.getMockImplementation() as (...args: A) => Promise<R>;
  let failed = false;
  mocked.mockImplementation((...args: A) => {
    if ((once && failed) || !matches(...args)) return actual(...args);
    failed = true;
    return meanwhile().then(() => Promise.reject(Object.assign(new Error(`injected ${code}`), { code })));
  });
  try {
    const result = await action();
    if (!failed) throw new Error(`${code} was never injected: no call matched`);
    return result;
  } finally {
    mocked.mockImplementation(actual);
  }
}
