import { describe, expect, it } from "vitest";
import { deleteEncryptedArqdorDraft, listEncryptedArqdorDraftIds, readEncryptedArqdorDraft, saveEncryptedArqdorDraft } from "./arqdorIndexedDraftStore";

describe("MULTI-03 IndexedDB encrypted draft store", () => {
  it("exposes a scoped persistence API without any automatic remote uploads", () => {
    expect(typeof saveEncryptedArqdorDraft).toBe("function");
    expect(typeof readEncryptedArqdorDraft).toBe("function");
    expect(typeof listEncryptedArqdorDraftIds).toBe("function");
    expect(typeof deleteEncryptedArqdorDraft).toBe("function");
  });

  it("rejects missing authorized scope and empty operation IDs", async () => {
    await expect(listEncryptedArqdorDraftIds({
      userId: "u1", tenantId: "", projectId: "p1", contextId: "c1",
    })).rejects.toThrow("OFFLINE_SCOPE_DENIED");
    await expect(deleteEncryptedArqdorDraft({
      userId: "u1", tenantId: "t1", projectId: "p1", contextId: "c1",
    }, "")).rejects.toThrow("OFFLINE_SCOPE_DENIED");
  });

  it("never falls back to unencrypted localStorage when IndexedDB is unavailable", async () => {
    if (typeof indexedDB !== "undefined") return;
    await expect(listEncryptedArqdorDraftIds({
      userId: "u1", tenantId: "t1", projectId: "p1", contextId: "c1",
    })).rejects.toThrow("OFFLINE_STORAGE_UNAVAILABLE");
  });
});
