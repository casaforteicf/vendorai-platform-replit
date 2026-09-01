import { describe, expect, it } from "vitest";
import { resolveClientTenantForDeal } from "./trial-tenant-resolution.js";

describe("resolveClientTenantForDeal", () => {
  it("preserva o tenant do deal para vendas comuns", () => {
    expect(resolveClientTenantForDeal({
      dealTenantId: "tenant-vendedor-ou-cliente",
      leadSource: "website",
      discoveryData: {},
    })).toEqual({
      tenantId: "tenant-vendedor-ou-cliente",
      fromTrial: false,
      valid: true,
    });
  });

  it("usa exclusivamente o trialTenantId para trial_signup", () => {
    expect(resolveClientTenantForDeal({
      dealTenantId: "tenant-vendorai-vendedor",
      leadSource: "trial_signup",
      discoveryData: { trialTenantId: "tenant-cliente-trial" },
    })).toEqual({
      tenantId: "tenant-cliente-trial",
      fromTrial: true,
      valid: true,
    });
  });

  it("falha seguro quando trial_signup não possui trialTenantId", () => {
    expect(resolveClientTenantForDeal({
      dealTenantId: "tenant-vendorai-vendedor",
      leadSource: "trial_signup",
      discoveryData: {},
    })).toEqual({
      tenantId: null,
      fromTrial: true,
      valid: false,
    });
  });

  it("não aceita trialTenantId vazio", () => {
    expect(resolveClientTenantForDeal({
      dealTenantId: "tenant-vendorai-vendedor",
      leadSource: "trial_signup",
      discoveryData: { trialTenantId: "   " },
    }).valid).toBe(false);
  });
});
