import { describe, expect, it } from "vitest";
import { legacySessionMenu, legacySessionOrganizationContext } from "./unifiedLegacySessionAdapter";

describe("UI-01 legacy auth compatibility", () => {
  const admin = { id: "user-1", tenantId: "tenant-a", role: "tenant_admin" };
  it("uses only the current session tenant", () => {
    const context = legacySessionOrganizationContext(admin, ["business", "finance"], "Empresa A");
    expect(context?.tenantId).toBe("tenant-a");
    expect(context?.kind).toBe("organization");
    expect(context?.enabledExperiences).toEqual(["business", "finance"]);
  });
  it("never infers memberships or modules from an unknown role", () => {
    expect(legacySessionOrganizationContext({ id: "u", tenantId: "t", role: "unknown" }, ["business"], "Tenant")).toBeNull();
    expect(legacySessionMenu(null)).toEqual([]);
  });
  it("does not offer modules absent from the authorized module list", () => {
    const context = legacySessionOrganizationContext(admin, ["commerce"], "Loja");
    expect(legacySessionMenu(context)).toEqual([{ title: "Marketplace", href: "/marketplace" }]);
  });
  it("rejects sessions without tenant and display label", () => {
    expect(legacySessionOrganizationContext({ id: "u" }, ["business"], "Empresa")).toBeNull();
    expect(legacySessionOrganizationContext(admin, ["business"], " ")).toBeNull();
  });
});
