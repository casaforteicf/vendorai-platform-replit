import { describe, expect, it } from "vitest";
import { seesWholeTenantWallet } from "./crm-visibility.js";

// Regressão do caso #3729: o usuário com função "administrador" via o lead na
// pipeline (a listagem usa essa regra) mas recebia 403 no detalhe, porque a
// leitura por ID usava uma definição mais estreita de administrador.
describe("crm-visibility — carteira administrativa do tenant", () => {
  it("libera super_admin, tenant_admin e a função administrador", () => {
    expect(seesWholeTenantWallet({ platformRole: "super_admin" })).toBe(true);
    expect(seesWholeTenantWallet({ platformRole: "tenant_admin" })).toBe(true);
    expect(seesWholeTenantWallet({ platformRole: "member", userFunction: "administrador" })).toBe(true);
  });

  it("mantém a carteira restrita para as demais funções humanas", () => {
    expect(seesWholeTenantWallet({ platformRole: "tenant_seller", userFunction: "vendedor" })).toBe(false);
    expect(seesWholeTenantWallet({ platformRole: "member", userFunction: "suporte" })).toBe(false);
    expect(seesWholeTenantWallet({ platformRole: "member" })).toBe(false);
    expect(seesWholeTenantWallet(null)).toBe(false);
    expect(seesWholeTenantWallet(undefined)).toBe(false);
  });
});
