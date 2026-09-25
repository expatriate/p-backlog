import type { Page } from "@playwright/test";

type ViolationReporter = { reportCspViolation: (violation: string) => Promise<void> };

export async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction("reportCspViolation", (violation: string) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const reporter = window as unknown as ViolationReporter;
      void reporter.reportCspViolation(`${event.effectiveDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  return violations;
}
