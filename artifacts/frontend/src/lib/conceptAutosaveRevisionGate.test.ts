import { describe, expect, it } from "vitest";
import { conceptAutosaveIfMatchHeader, isConceptAutosaveConflict } from "./conceptAutosaveRevisionGate";

const REV = "2026-10-11T18:00:00.000Z";

describe("MULTI-04 concept autosave revision gate", () => {
  describe("flag OFF keeps the legacy unversioned autosave", () => {
    it("never adds an If-Match header, even with a captured revision", () => {
      expect(conceptAutosaveIfMatchHeader(false, "p1", REV)).toEqual({});
      expect(conceptAutosaveIfMatchHeader(false, "p1", null)).toEqual({});
      expect(conceptAutosaveIfMatchHeader(false, null, REV)).toEqual({});
    });
    it("does not treat HTTP 409 as a revision conflict (legacy error handling)", () => {
      expect(isConceptAutosaveConflict(false, 409)).toBe(false);
      expect(isConceptAutosaveConflict(false, 200)).toBe(false);
      expect(isConceptAutosaveConflict(false, 500)).toBe(false);
    });
  });

  describe("flag ON makes the autosave CAS-safe", () => {
    it("sends If-Match with the captured server revision on an existing project", () => {
      expect(conceptAutosaveIfMatchHeader(true, "p1", REV)).toEqual({ "If-Match": REV });
    });
    it("omits If-Match for a new project or when no revision was captured yet", () => {
      // New project -> POST, no conditional header.
      expect(conceptAutosaveIfMatchHeader(true, null, REV)).toEqual({});
      // Existing project without a captured revision: header omitted; the editor
      // pre-flight blocks this case so no unconditional PATCH is sent.
      expect(conceptAutosaveIfMatchHeader(true, "p1", null)).toEqual({});
    });
    it("rejects/signals a diverged server revision (HTTP 409) instead of overwriting", () => {
      expect(isConceptAutosaveConflict(true, 409)).toBe(true);
      // A successful or other-error response is not a conflict.
      expect(isConceptAutosaveConflict(true, 200)).toBe(false);
      expect(isConceptAutosaveConflict(true, 403)).toBe(false);
    });
  });
});
