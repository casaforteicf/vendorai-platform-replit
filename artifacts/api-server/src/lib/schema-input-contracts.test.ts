import { describe, expect, it } from "vitest";
import { insertActivitySchema, updateActivitySchema, insertEquipamentoRecursoSchema, insertServicoMedicaoSchema, insertCustomerIntelligenceSchema } from "@workspace/db";
import { persistedAgentName } from "./agent-name";

describe("schema input contracts", () => {
  it("accepts record metadata, preserving omitted and nullable fields", () => {
    const base = { tenantId: "tenant", nome: "Guindaste", origem: "locado", unidadeCobranca: "dia" };
    expect(insertEquipamentoRecursoSchema.parse(base).especificacaoTecnica).toBeUndefined();
    expect(insertEquipamentoRecursoSchema.parse({ ...base, especificacaoTecnica: null }).especificacaoTecnica).toBeNull();
    expect(insertEquipamentoRecursoSchema.parse({ ...base, especificacaoTecnica: { capacidade: 10 } }).especificacaoTecnica).toEqual({ capacidade: 10 });
    expect(insertEquipamentoRecursoSchema.safeParse({ ...base, especificacaoTecnica: "invalid" }).success).toBe(false);
  });
  it("requires a measurement number before persistence and normalizes numeric input", () => {
    const base = { tenantId: "tenant", contratoId: "contract" };
    expect(insertServicoMedicaoSchema.safeParse(base).success).toBe(false);
    expect(insertServicoMedicaoSchema.parse({ ...base, numeroMedicao: 2 }).numeroMedicao).toBe("2");
    expect(insertServicoMedicaoSchema.safeParse({ ...base, numeroMedicao: "bad" }).success).toBe(false);
  });
  it("validates handoff modes without requiring optional metadata on create/update", () => {
    const base = { tenantId: "tenant", leadId: "lead", tipo: "tarefa", titulo: "Follow up" };
    expect(insertActivitySchema.safeParse(base).success).toBe(true);
    expect(insertActivitySchema.safeParse({ ...base, handoffMode: "invalid" }).success).toBe(false);
    expect(updateActivitySchema.safeParse({ handoffMode: "responsibility", formularioRespostas: { accepted: true } }).success).toBe(true);
  });
  it("rejects invalid risk and health values but accepts nullable intelligence", () => {
    const base = { tenantId: "tenant", leadId: "lead" };
    expect(insertCustomerIntelligenceSchema.safeParse({ ...base, healthStatus: null }).success).toBe(true);
    expect(insertCustomerIntelligenceSchema.safeParse({ ...base, riskLevel: "invalid" }).success).toBe(false);
  });
  it("uses the existing service agent configuration for pharmacy tasks", () => {
    expect(persistedAgentName("pharmacy")).toBe("service");
    expect(persistedAgentName("sdr")).toBe("sdr");
  });
});
