import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Contract regression: ensures the admin-only restore endpoint cannot be
// accidentally replaced by the generic lead PATCH in a later refactor.
const routes = readFileSync(new URL("./leads.ts", import.meta.url), "utf8");

describe("CRM-08/23 — contrato de exclusão e recuperação", () => {
  it("separa restauração administrativa de PATCH comum", () => {
    expect(routes).toContain('router.post("/leads/:id/restore"');
    expect(routes).toContain('const protectedFields = ["excluidoEm", "motivoExclusao", "metadata"]');
  });
  it("mantém escopo de tenant e privilégios de administrador", () => {
    const restore = routes.split('router.post("/leads/:id/restore"')[1]?.split('router.delete("/leads/:id"')[0] ?? "";
    expect(restore).toContain("existing.tenantId !== req.user?.tenantId");
    expect(restore).toContain('req.user?.platformRole !== "tenant_admin"');
    expect(restore).toContain('req.user?.userFunction !== "administrador"');
  });
  it("recusa recuperação simples de leads mesclados e replays concorrentes", () => {
    const restore = routes.split('router.post("/leads/:id/restore"')[1]?.split('router.delete("/leads/:id"')[0] ?? "";
    expect(restore).toContain("previousMetadata.leadMerge");
    expect(restore).toContain("eq(leadsTable.excluidoEm, existing.excluidoEm)");
  });
  it("impede leitura de excluídos por ID sem administrador", () => {
    const read = routes.split('router.get("/leads/:id"')[1]?.split('router.patch("/leads/:id"')[0] ?? "";
    expect(read).toContain("Lead excluído: acesso administrativo obrigatório.");
  });
});
