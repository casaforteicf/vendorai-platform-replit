import { describe, expect, it } from "vitest";
import { scoreConstructionOpportunity } from "./construction-radar-search.js";
import { evaluateColdProspectQuality } from "../lib/coldProspectQuality.js";

describe("construction radar -> Prospector", () => {
  it("prioritizes an early-stage work with official source and technical responsible", () => {
    const result = scoreConstructionOpportunity({
      sourceAuthority: "oficial",
      confidence: 90,
      fase: "aprovação",
      proprietario: "Cliente publicado",
      responsavelTecnico: "Arquiteta Ana",
      construtora: null,
      incorporadora: null,
      endereco: "Rua Exemplo, 100",
      dataReferencia: null,
    });

    expect(result.priority).toBe("alta");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.recommendedActor).toBe("responsavel_tecnico");
    expect(result.reason).toContain("fonte oficial");
  });

  it("keeps a completed low-evidence work at low priority", () => {
    const result = scoreConstructionOpportunity({
      sourceAuthority: "secundaria",
      confidence: 45,
      fase: "concluída",
      proprietario: null,
      responsavelTecnico: null,
      construtora: null,
      incorporadora: null,
      endereco: null,
      dataReferencia: null,
    });

    expect(result.priority).toBe("baixa");
    expect(result.recommendedActor).toBe("identificar");
  });

  it("counts verified construction evidence without inventing digital evidence", () => {
    const quality = evaluateColdProspectQuality({
      segmento: "Construção civil residencial",
      telefone: null,
      email: null,
      instagramHandle: null,
      websiteUrl: null,
      source: "construction_radar",
      metadata: {
        construction_signal: "Alvará residencial publicado para obra em fase de aprovação",
        construction_signal_url: "https://example.gov.br/alvara/123",
        construction_signal_authority: "oficial",
        construction_actor_name: "Arquiteta Ana",
        construction_actor_role: "responsavel_tecnico",
      },
      digital: {
        tem_site: false,
        site_qualidade: "nenhum",
        tem_agendamento_online: false,
        tem_ecommerce: false,
        presenca_instagram: false,
        indicio_crm: false,
        presenca_google: false,
      },
      growth: {
        reviews_velocity: 0,
        rating_trend: "estavel",
        horario_estendido: false,
        multiplas_unidades: false,
        contratando: false,
        anuncios_ativos: false,
      },
      propensityScore: 90,
      dispatchThreshold: 80,
    });

    expect(quality.evidence.map((item) => item.key)).toContain("construction_work_signal");
    expect(quality.evidence.map((item) => item.key)).toContain("construction_actor");
    expect(quality.hasValidContact).toBe(false);
    expect(quality.ready).toBe(false);
    expect(quality.reasons).toContain("sem_contato_utilizavel");
  });
});
