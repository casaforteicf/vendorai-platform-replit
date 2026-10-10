import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Source contract tests are regression guards, not authenticated API tests.
const api = readFileSync(new URL("./crm_deal_participants.ts", import.meta.url), "utf8");
const frontend = readFileSync(new URL("../../../frontend/src/components/NewLeadDialog.tsx", import.meta.url), "utf8");

describe("CRM-02/03 — casal, identidade e contato principal", () => {
  it("mantém ambos como clientes principais individualizados", () => {
    const couple = api.split('router.post("/crm/deals/:dealId/couple"')[1]?.split('router.post("/crm/deals/:dealId/people"')[0] ?? "";
    expect(couple).toContain('clientePrincipal: true, ordemClientePrincipal: index + 1');
    expect(couple).toContain('role: "consumidor_final"');
    expect(couple).toContain('primaryContactIndex');
    expect(couple).toContain('isPrimary: index === (parsed.data.primaryContactIndex ?? 0)');
  });
  it("recusa identidade duplicada e registra requisição idempotente", () => {
    expect(api).toContain("Os dois clientes devem possuir documentos distintos.");
    expect(api).toContain("e-mail e nome idênticos");
    expect(api).toContain("telefone e nome idênticos");
    expect(api).toContain("registrationPayloadHash");
  });
  it("expõe a escolha do contato principal no cadastro e na API", () => {
    expect(frontend).toContain("Contato principal para comunicação");
    expect(frontend).toContain("primaryContactIndex: values.primaryContactIndex");
    expect(frontend).toContain('isPrimary: values.primaryContactIndex === 1');
  });
  it("bloqueia participantes de negócios com lead arquivado sem bloquear negócios independentes", () => {
    const access = api.split("async function assertDeal")[1]?.split("function digits")[0] ?? "";
    expect(access).toContain(".leftJoin(leadsTable");
    expect(access).toContain("isNull(dealsTable.leadId)");
    expect(access).toContain("isNull(leadsTable.excluidoEm)");
    expect(access).toContain("eq(leadsTable.tenantId, tenantId)");
  });
  it("não expõe participantes via busca a partir de negócio com lead excluído", () => {
    const search = api.split('router.get("/crm/people"')[1]?.split("const personSchema")[0] ?? "";
    expect(search).toContain(".leftJoin(leadsTable");
    expect(search).toContain("isNull(dealsTable.leadId)");
    expect(search).toContain("isNull(leadsTable.excluidoEm)");
  });
  it("não usa lead excluído para liberar dados pessoais na busca do CRM", () => {
    expect(api).toContain("eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm)");
  });
  it("remove metadados de comissão de respostas aninhadas", () => {
    expect(api).toContain("safeParticipantMetadata(item.link.metadata, canManageCrmCommissions(req))");
  });
});
