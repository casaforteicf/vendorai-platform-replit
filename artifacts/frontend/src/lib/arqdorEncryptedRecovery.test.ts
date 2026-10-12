import { describe, expect, it, vi } from "vitest";
import { reviewEncryptedRecovery } from "./arqdorEncryptedRecovery";
import * as vault from "./arqdorEncryptedVault";
const scope = { tenantId:"t", userId:"u", contextId:"c", projectId:"p" };
const remote = { ...scope, revision:"12", canEdit:true };
describe("MULTI-09.4 manual encrypted recovery", () => {
  it("refuses mismatched identity before reading local content", async () => {
    const spy = vi.spyOn(vault, "openEncryptedArqdorDraft");
    try {
      expect(await reviewEncryptedRecovery(scope, {...remote,userId:"other"}, "phrase")).toEqual({status:"denied"});
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("returns missing when no encrypted draft exists", async () => {
    const spy = vi.spyOn(vault, "openEncryptedArqdorDraft").mockResolvedValue(undefined);
    try { expect(await reviewEncryptedRecovery(scope, remote, "phrase")).toEqual({status:"missing"}); }
    finally { spy.mockRestore(); }
  });
  it("reports conflict without pushing to server", async () => {
    const draft = { scope, savedAt:new Date().toISOString(), content:{id:"p"},change:{operationId:"op",projectId:"p",baseRevision:"11",kind:"geometry" as const} };
    const spy = vi.spyOn(vault, "openEncryptedArqdorDraft").mockResolvedValue(draft);
    try {
      const result = await reviewEncryptedRecovery(scope,remote,"phrase");
      expect(result.status).toBe("review");
      if(result.status==="review") expect(result.decision.status).toBe("conflict");
    } finally { spy.mockRestore(); }
  });
});
