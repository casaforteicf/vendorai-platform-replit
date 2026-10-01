import { describe, expect, it } from "vitest";
import { actionShouldChangePage, verifyCheckpointTransition } from "./browser-verifier.js";

const checkpoint = (overrides: Record<string, unknown> = {}) => ({
  url: "https://example.com/a",
  title: "A",
  textSignature: "11111111",
  interactiveCount: 3,
  capturedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

describe("browser action verifier", () => {
  it("detects observable transitions", () => {
    expect(verifyCheckpointTransition(checkpoint(), checkpoint({ textSignature: "22222222" })).changed).toBe(true);
  });

  it("detects no-op transitions", () => {
    expect(verifyCheckpointTransition(checkpoint(), checkpoint({ capturedAt: "2026-10-01T00:00:01.000Z" })).changed).toBe(false);
  });

  it("knows which action classes normally require a visible transition", () => {
    expect(actionShouldChangePage("click")).toBe(true);
    expect(actionShouldChangePage("navigate")).toBe(true);
    expect(actionShouldChangePage("type")).toBe(false);
    expect(actionShouldChangePage("extract")).toBe(false);
  });
});
