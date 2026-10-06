import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/pages/Propostas.tsx"), "utf8");

describe("imported budget extraction resilience", () => {
  it("retries transient gateway failures instead of failing the import immediately", () => {
    expect(source).toContain("for (let attempt = 1; attempt <= 3; attempt += 1)");
    expect(source).toContain("[502, 503, 504].includes(response.status)");
    expect(source).toContain("attempt * 1200");
  });

  it("surfaces the backend extraction error when available", () => {
    expect(source).toContain("extractError.message");
    expect(source).toContain("extractError.error");
  });
});
