import { describe, expect, it } from "vitest";
import { mergeBrowserProfiles } from "./browser-profile.js";

describe("browser profile persistence", () => {
  it("merges storage from multiple origins without losing prior state", () => {
    const first = {
      version: 1 as const,
      cookies: [],
      origins: { "https://one.example": { localStorage: { token: "one" } } },
      capturedAt: "2026-10-01T00:00:00.000Z",
    };
    const next = {
      version: 1 as const,
      cookies: [],
      origins: { "https://two.example": { localStorage: { tenant: "two" } } },
      capturedAt: "2026-10-01T01:00:00.000Z",
    };
    const merged = mergeBrowserProfiles(first, next);
    expect(merged.origins["https://one.example"]?.localStorage.token).toBe("one");
    expect(merged.origins["https://two.example"]?.localStorage.tenant).toBe("two");
    expect(merged.capturedAt).toBe(next.capturedAt);
  });
});
