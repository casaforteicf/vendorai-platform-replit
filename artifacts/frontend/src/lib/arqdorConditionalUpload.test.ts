import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadArqdorDraftConditionally } from "./arqdorConditionalUpload";
const draft = { tenantId:"t", userId:"u", contextId:"c", projectId:"p", baseRevision:"12", savedAt:"now", payload:{ id:"p", name:"A" } };
const remote = { tenantId:"t", userId:"u", contextId:"c", projectId:"p", revision:"12", canEdit:true };
afterEach(() => vi.unstubAllGlobals());
describe("MULTI-04 explicit conditional sync", () => {
  it("does not transmit without permission", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await uploadArqdorDraftConditionally(draft, { ...remote, canEdit:false }, "tok")).status).toBe("denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not transmit conflicting revisions", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await uploadArqdorDraftConditionally(draft, { ...remote, revision:"13" }, "tok")).status).toBe("conflict");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses conditional endpoint and detects server race", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status:409, ok:false });
    vi.stubGlobal("fetch", fetchMock);
    expect((await uploadArqdorDraftConditionally(draft, remote, "tok")).status).toBe("conflict");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/arqdor/projects/p/conditional");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedRevision).toBe("12");
  });
  it("does not delete local copy after success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status:200, ok:true, json:async()=>({ id:"p", revision:"13" }) }));
    expect(await uploadArqdorDraftConditionally(draft, remote, "tok")).toEqual({status:"saved",revision:"13"});
  });
  it("reports uncertain network delivery instead of retrying", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await uploadArqdorDraftConditionally(draft, remote, "tok")).status).toBe("failed");
  });
});
