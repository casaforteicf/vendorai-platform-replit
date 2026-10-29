import { describe, expect, it } from "vitest";
import { shouldStartBackgroundJobs } from "./background-jobs.js";

describe("shouldStartBackgroundJobs", () => {
  it("starts workers by default", () => {
    expect(shouldStartBackgroundJobs({})).toBe(true);
  });

  it.each(["1", "true", "YES"])("disables workers for %s", (value) => {
    expect(shouldStartBackgroundJobs({ VENDORAI_DISABLE_BACKGROUND_JOBS: value })).toBe(false);
  });

  it("keeps workers enabled when the flag is false", () => {
    expect(shouldStartBackgroundJobs({ VENDORAI_DISABLE_BACKGROUND_JOBS: "false" })).toBe(true);
  });
});
