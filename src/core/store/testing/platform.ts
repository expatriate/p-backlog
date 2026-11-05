export async function asIfOnWindows<T>(action: () => Promise<T>): Promise<T> {
  const platform = process.platform;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    return await action();
  } finally {
    Object.defineProperty(process, "platform", { value: platform });
  }
}
