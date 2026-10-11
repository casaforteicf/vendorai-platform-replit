import { describe, expect, it } from "vitest";
import { restoreRequestFingerprint } from "./arqdor-recovery-fingerprint";

const base = {
  actorUserId: "user-a",
  expectedUpdatedAt: new Date("2026-10-11T18:00:00.000Z"),
  rooms: [{ id: "room-1", width: 4 }],
  openingOverrides: {},
};

describe("MULTI-04.5 restore request idempotency", () => {
  it("keeps the same fingerprint for an identical retry", () => {
    expect(restoreRequestFingerprint(base)).toBe(restoreRequestFingerprint({ ...base }));
  });
  it("rejects operation reuse with different actor, revision or geometry", () => {
    const original = restoreRequestFingerprint(base);
    expect(restoreRequestFingerprint({ ...base, actorUserId: "user-b" })).not.toBe(original);
    expect(restoreRequestFingerprint({ ...base, expectedUpdatedAt: new Date("2026-10-11T18:00:01.000Z") })).not.toBe(original);
    expect(restoreRequestFingerprint({ ...base, rooms: [{ id: "room-1", width: 5 }] })).not.toBe(original);
  });
  it("rejects invalid fingerprint inputs", () => {
    expect(() => restoreRequestFingerprint({ ...base, actorUserId: "" })).toThrow();
  });
});
