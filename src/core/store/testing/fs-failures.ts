import { vi } from "vitest";

export async function failingOnce<A extends unknown[], R, T>(target: (...args: A) => Promise<R>, matches: (...args: A) => boolean, action: () => Promise<T>, { code = "EIO" } = {}): Promise<T> {
  const mocked = vi.mocked(target);
  const actual = mocked.getMockImplementation() as (...args: A) => Promise<R>;
  let failed = false;
  mocked.mockImplementation((...args: A) => {
    if (failed || !matches(...args)) return actual(...args);
    failed = true;
    return Promise.reject(Object.assign(new Error(`injected ${code}`), { code }));
  });
  try {
    const result = await action();
    if (!failed) throw new Error(`${code} was never injected: no call matched`);
    return result;
  } finally {
    mocked.mockImplementation(actual);
  }
}
