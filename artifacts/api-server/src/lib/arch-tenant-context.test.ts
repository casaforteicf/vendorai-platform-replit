import { describe, expect, it } from "vitest";
import { resolveArchTenantId } from "./arch-tenant-context.js";

describe("Arqdor tenant context", () => {
  it("usa tenant da sessão para usuário comum", () => {
    expect(resolveArchTenantId(
      { tenantId: "tenant-session", platformRole: "tenant_admin" },
      "tenant-other",
    )).toBe("tenant-session");
  });

  it("permite tenant efetivo explícito para super admin", () => {
    expect(resolveArchTenantId(
      { tenantId: null, platformRole: "super_admin" },
      "tenant-override",
    )).toBe("tenant-override");
  });

  it("faz fallback ao tenant da sessão do super admin quando existir", () => {
    expect(resolveArchTenantId(
      { tenantId: "tenant-session", platformRole: "super_admin" },
      undefined,
    )).toBe("tenant-session");
  });

  it("não inventa tenant quando super admin não selecionou empresa", () => {
    expect(resolveArchTenantId(
      { tenantId: null, platformRole: "super_admin" },
      undefined,
    )).toBeNull();
  });
});
