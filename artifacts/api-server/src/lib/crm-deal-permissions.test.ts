import { describe, expect, it } from "vitest";
import { canChangeDealOwner } from "./crm-deal-permissions.js";

// Regressão do 403 "Apenas o administrador pode reatribuir o negócio.":
// a regra de reatribuição precisa ser a mesma do restante do CRM (inclui a
// função "administrador") e a primeira atribuição de um negócio sem
// responsável não pode ser tratada como reatribuição.
describe("crm-deal-permissions — troca de responsável do negócio", () => {
  it("libera administradores do CRM, inclusive a função administrador", () => {
    expect(canChangeDealOwner({ platformRole: "super_admin", sub: "u1" }, "owner-a", "owner-b")).toBe(true);
    expect(canChangeDealOwner({ platformRole: "tenant_admin", sub: "u1" }, "owner-a", "owner-b")).toBe(true);
    expect(canChangeDealOwner({ platformRole: "member", userFunction: "administrador", sub: "u1" }, "owner-a", "owner-b")).toBe(true);
    expect(canChangeDealOwner({ platformRole: "member", userFunction: "administrador", sub: "u1" }, null, "owner-b")).toBe(true);
  });

  it("permite ao usuário assumir um negócio que ainda não tem responsável", () => {
    const seller = { platformRole: "tenant_seller", userFunction: "vendedor", sub: "seller-1" };
    expect(canChangeDealOwner(seller, null, "seller-1")).toBe(true);
    expect(canChangeDealOwner(seller, undefined, "seller-1")).toBe(true);
  });

  it("não deixa o vendedor escolher outro responsável nem trocar o dono de negócio já atribuído", () => {
    const seller = { platformRole: "tenant_seller", userFunction: "vendedor", sub: "seller-1" };
    expect(canChangeDealOwner(seller, "seller-1", "seller-1")).toBe(true);
    expect(canChangeDealOwner(seller, null, "seller-2")).toBe(false);
    expect(canChangeDealOwner(seller, "seller-1", "seller-2")).toBe(false);
    expect(canChangeDealOwner(seller, "owner-x", "seller-1")).toBe(false);
  });

  it("nega quando não há usuário autenticado", () => {
    expect(canChangeDealOwner(null, null, "seller-1")).toBe(false);
    expect(canChangeDealOwner(undefined, null, "seller-1")).toBe(false);
  });
});
