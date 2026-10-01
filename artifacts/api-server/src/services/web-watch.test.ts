import { describe, expect, it } from "vitest";
import { compareWatchFingerprint, fingerprintSkillResult } from "./web-watch.js";

describe("web watch fingerprint", () => {
  it("changes when extracted data changes", () => {
    const a = fingerprintSkillResult({ finalUrl: "https://x.test", steps: [{ action: "extract", detail: "R$ 10", verified: true }] });
    const b = fingerprintSkillResult({ finalUrl: "https://x.test", steps: [{ action: "extract", detail: "R$ 11", verified: true }] });
    expect(a).not.toBe(b);
    expect(compareWatchFingerprint(a, b).changed).toBe(true);
  });

  it("initializes cleanly without reporting a change", () => {
    expect(compareWatchFingerprint(null, "abc")).toEqual({
      previous: null,
      current: "abc",
      changed: false,
      initialized: true,
    });
  });
});
