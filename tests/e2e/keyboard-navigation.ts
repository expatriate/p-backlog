// macOS WebKit tabs only to text fields unless the OS keyboard-navigation setting is on
export const tabSkipsControls = (browserName: string) => browserName === "webkit" && process.platform === "darwin";
