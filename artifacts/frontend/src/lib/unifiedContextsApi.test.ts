import { describe, expect, it } from "vitest";
import { decodeVerifiedContexts } from "./unifiedContextsApi";

const valid = {
  currentContextId: "organization:tenant-a",
  capabilitiesStatus: "pending_backend_entitlement_mapping",
  contexts: [{
    id: "organization:tenant-a", kind: "organization",
    tenantId: "tenant-a", label: "Empresa A",
    roles: ["member"], enabledExperiences: [],
  }],
};

describe("UI-01.6 read-only discovery response", () => {
  it("accepts the explicit no-entitlements server response", () => {
    expect(decodeVerifiedContexts(valid)?.contexts[0]?.enabledExperiences).toEqual([]);
  });
  it("rejects tampered module grants", () => {
    const data = structuredClone(valid);
    data.contexts[0]!.enabledExperiences.push("business" as never);
    expect(decodeVerifiedContexts(data)).toBeNull();
  });
  it("rejects arbitrary context kinds and unrelated current IDs", () => {
    expect(decodeVerifiedContexts({ ...valid, currentContextId: "organization:tenant-b" })).toBeNull();
    expect(decodeVerifiedContexts({ ...valid, contexts: [{ ...valid.contexts[0], kind: "project" }] })).toBeNull();
  });
  it("rejects missing roles and incomplete responses", () => {
    expect(decodeVerifiedContexts({ ...valid, contexts: [{ ...valid.contexts[0], roles: ["super_admin"] }] })).toBeNull();
    expect(decodeVerifiedContexts({})).toBeNull();
  });
});
