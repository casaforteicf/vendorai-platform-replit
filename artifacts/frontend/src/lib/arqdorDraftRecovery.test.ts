import { describe, expect, it, vi } from "vitest";
import { inspectArqdorDraftRecovery } from "./arqdorDraftRecovery";
import * as storage from "./arqdorLocalDrafts";
vi.mock("./arqdorLocalDrafts", () => ({ loadArqdorDraft: vi.fn() }));
const remote = { tenantId:"a", userId:"u", contextId:"c", projectId:"p", revision:"r1", canEdit:true };
const draft = { ...remote, baseRevision:"r1", savedAt:"now", payload:{ rooms:[] } };

describe("MULTI-06 read-only Arqdor recovery review", () => {
  it("denies before reading local data if server permission absent", async () => {
    vi.mocked(storage.loadArqdorDraft).mockClear();
    expect(await inspectArqdorDraftRecovery({ ...remote, canEdit:false })).toEqual({ status:"denied", decision:{ status:"denied", reason:"unauthorized" } });
    expect(storage.loadArqdorDraft).not.toHaveBeenCalled();
  });
  it("prevents missing tenant scope before reading local data", async () => {
    vi.mocked(storage.loadArqdorDraft).mockClear();
    expect((await inspectArqdorDraftRecovery({ ...remote, tenantId:"" })).status).toBe("denied");
    expect(storage.loadArqdorDraft).not.toHaveBeenCalled();
  });
  it("reports absent draft without mutation", async () => {
    vi.mocked(storage.loadArqdorDraft).mockResolvedValue(undefined);
    expect(await inspectArqdorDraftRecovery(remote)).toEqual({ status:"no-local-draft" });
  });
  it("shows reviewable conflict without uploading", async () => {
    vi.mocked(storage.loadArqdorDraft).mockResolvedValue(draft);
    const review = await inspectArqdorDraftRecovery({ ...remote, revision:"r2" });
    expect(review.status).toBe("local-draft");
    if (review.status === "local-draft") expect(review.decision.status).toBe("conflict");
  });
});
