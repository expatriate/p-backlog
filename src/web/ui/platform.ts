const APPLE_PLATFORM = /Mac|iPhone|iPad/;

export function isApplePlatform(): boolean {
  return APPLE_PLATFORM.test(navigator.platform);
}
