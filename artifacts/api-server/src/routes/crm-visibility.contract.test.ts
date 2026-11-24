import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Contrato do caso #3729: a listagem e as leituras por ID precisam usar a mesma
// regra de carteira. Duas definições de "administrador" faziam o lead aparecer
// na pipeline e o detalhe responder 403 ("Lead não encontrado" na tela).
const authSource = readFileSync(new URL("../middlewares/auth.ts", import.meta.url), "utf8");
const leadsSource = readFileSync(new URL("./leads.ts", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("crm-visibility — contrato entre listagem e leitura por ID", () => {
  it("a listagem (buildUserFunctionFilter) usa a regra compartilhada", () => {
    const filter = authSource.split("export function buildUserFunctionFilter")[1] ?? "";
    expect(filter).toContain("isConfigurationAdmin(req.user)");
    expect(authSource).toContain("return seesWholeTenantWallet(user);");
  });

  it("a leitura, a edição e o histórico por ID usam a regra compartilhada", () => {
    expect(leadsSource.match(/seesWholeTenantWallet\(req\.user\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    const read = leadsSource.split('router.get("/leads/:id"')[1]?.split('router.patch("/leads/:id"')[0] ?? "";
    expect(read).toContain("seesWholeTenantWallet(req.user)");
    expect(read).not.toContain(
      'const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";',
    );
  });

  it("a troca de tenant é montada antes do /auth/:provider das integrações sociais", () => {
    const switchMount = routesSource.indexOf("router.use(tenantSwitchRouter);");
    const socialMount = routesSource.indexOf("router.use(socialIntegrationsRouter);");
    expect(switchMount).toBeGreaterThan(-1);
    expect(socialMount).toBeGreaterThan(-1);
    expect(switchMount).toBeLessThan(socialMount);
  });
});
