import { afterEach, describe, expect, it, vi } from "vitest";
import { saveConceptWithRevision } from "./arqdorRevisionAutosave";

afterEach(() => vi.unstubAllGlobals());
const base = { projectId: "p1", revision: "2026-10-11T18:00:00.000Z", token: "test-token", updates: { currentStep: 2 } };

describe("MULTI-04.8 revision-conditional autosave", () => {
  it("sends the expected revision and returns the server revision", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ updatedAt: "2026-10-11T18:00:01.000Z" }),
    });
    vi.stubGlobal("fetch", mocked);
    expect((await saveConceptWithRevision(base)).status).toBe("saved");
    expect(mocked.mock.calls[0][1].headers["If-Match"]).toBe(base.revision);
  });
  it("never retries or overwrites on revision conflict", async () => {
    const mocked = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    vi.stubGlobal("fetch", mocked);
    expect(await saveConceptWithRevision(base)).toEqual({ status: "conflict" });
    expect(mocked).toHaveBeenCalledTimes(1);
  });
  it("rejects missing revision before calling server", async () => {
    const mocked = vi.fn(); vi.stubGlobal("fetch", mocked);
    await expect(saveConceptWithRevision({ ...base, revision: "" })).rejects.toThrow("PROJECT_REVISION_REQUIRED");
    expect(mocked).not.toHaveBeenCalled();
  });
});
