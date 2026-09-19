import { describe, expect, it } from "vitest";
import { isTestPath } from "./test-paths";

describe("тестовые файлы", () => {
  it("узнаёт тесты по имени и каталогу", () => {
    for (const path of ["src/a.test.ts", "src/a.spec.tsx", "pkg/foo_test.go", "app/test_views.py", "tests/e2e/x.ts", "src/__tests__/a.ts", "e2e/login.ts", "spec/model.rb", "src/{a.ts => a.test.ts}"]) {
      expect(isTestPath(path), path).toBe(true);
    }
  });

  it("не путает похожие имена", () => {
    for (const path of ["src/latest.ts", "src/contest/a.ts", "src/testing-utils.ts", "docs/spectrum.ts", "attest.py"]) {
      expect(isTestPath(path), path).toBe(false);
    }
  });
});
