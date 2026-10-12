import { describe, expect, it, vi } from "vitest";
import { deleteArqdorDraft, loadArqdorDraft, saveArqdorDraft } from "./arqdorLocalDrafts";
const base = { tenantId: "tenant-a", userId: "user-a", contextId: "context-a", projectId: "project-a", baseRevision: "r1", savedAt: "2026-10-11T00:00:00.000Z", payload: { walls: [{ id: "wall1", thickness: 0.15 }] } };

describe("MULTI-03 IndexedDB draft fail-closed boundaries", () => {
  it("rejects missing scope identifiers before storage access", async () => {
    await expect(saveArqdorDraft({ ...base, tenantId: "" })).rejects.toThrow("Missing project isolation identifiers");
    await expect(loadArqdorDraft({ ...base, userId: "" })).rejects.toThrow("Missing project isolation identifiers");
    await expect(deleteArqdorDraft({ ...base, projectId: "" })).rejects.toThrow("Missing project isolation identifiers");
  });
  it("rejects drafts without origin revision", async () => {
    await expect(saveArqdorDraft({ ...base, baseRevision: "" })).rejects.toThrow("Missing revision metadata");
  });
  it("fails explicitly without IndexedDB instead of pretending data was saved", async () => {
    const original = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    try {
      await expect(saveArqdorDraft(base)).rejects.toThrow("IndexedDB unavailable");
      await expect(loadArqdorDraft(base)).rejects.toThrow("IndexedDB unavailable");
    } finally { vi.stubGlobal("indexedDB", original); vi.unstubAllGlobals(); }
  });
});
