import { describe, expect, it } from "vitest";
import { evaluateColdProspectQuality } from "./coldProspectQuality.js";

function baseInput(overrides: Partial<Parameters<typeof evaluateColdProspectQuality>[0]> = {}) {
  return {
    segmento: "Distribuição de materiais",
    telefone: "49999999999",
    email: null,
    instagramHandle: null,
    instagramScopedId: null,
    websiteUrl: "https://empresa.example",
    source: "google_maps_prospecting",
    metadata: {
      rating: 4.6,
      total_ratings: 120,
    },
    digital: {
      tem_site: true,
      site_qualidade: "profissional" as const,
      tem_agendamento_online: false,
      tem_ecommerce: false,
      presenca_instagram: false,
      indicio_crm: false,
      presenca_google: true,
    },
    growth: {
      reviews_velocity: 5,
      rating_trend: "subindo" as const,
      horario_estendido: false,
      multiplas_unidades: false,
      contratando: false,
      anuncios_ativos: false,
    },
    propensityScore: 90,
    dispatchThreshold: 80,
    channelCapabilities: { whatsapp: true, email: false, instagram: false },
    ...overrides,
  };
}

describe("cold prospect quality — executable channels", () => {
  it("allows automatic outreach when WhatsApp/phone is available", () => {
    const result = evaluateColdProspectQuality(baseInput());
    expect(result.ready).toBe(true);
    expect(result.hasValidContact).toBe(true);
    expect(result.hasExecutableChannel).toBe(true);
    expect(result.preferredChannel).toBe("whatsapp");
    expect(result.channels.find((item) => item.channel === "whatsapp")?.autoExecutable).toBe(true);
  });

  it("keeps email-only prospects for enrichment/manual routing instead of false auto-ready", () => {
    const result = evaluateColdProspectQuality(baseInput({
      telefone: null,
      email: "compras@empresa.example",
      channelCapabilities: { whatsapp: false, email: false, instagram: false },
    }));
    expect(result.hasValidContact).toBe(true);
    expect(result.hasExecutableChannel).toBe(false);
    expect(result.preferredChannel).toBe("email");
    expect(result.ready).toBe(false);
    expect(result.status).toBe("needs_more_data");
    expect(result.reasons).toContain("sem_canal_automatico_executavel");
  });


  it("allows email-only automatic outreach only when the safe inbound reply loop is enabled", () => {
    const result = evaluateColdProspectQuality(baseInput({
      telefone: null,
      email: "compras@empresa.example",
      channelCapabilities: { whatsapp: false, email: true, instagram: false },
    }));
    expect(result.ready).toBe(true);
    expect(result.hasExecutableChannel).toBe(true);
    expect(result.preferredChannel).toBe("email");
    expect(result.channels.find((item) => item.channel === "email")?.autoExecutable).toBe(true);
  });

  it("does not treat a public Instagram handle as permission for automated cold DM", () => {
    const result = evaluateColdProspectQuality(baseInput({
      telefone: null,
      email: null,
      instagramHandle: "@empresa",
      instagramScopedId: null,
    }));
    expect(result.hasValidContact).toBe(true);
    expect(result.hasExecutableChannel).toBe(false);
    expect(result.preferredChannel).toBe("instagram");
    expect(result.reasons).toContain("sem_canal_automatico_executavel");
  });

  it("uses tenant-configured niche signals/modules instead of hardcoding a market", () => {
    const result = evaluateColdProspectQuality(baseInput({
      segmento: "Clínica odontológica",
      metadata: {
        rating: 4.8,
        total_ratings: 80,
        prospector_niche: "implantes premium",
        prospector_focus_signals: ["reviews", "hiring"],
        prospector_recommended_modules: ["crm", "agendamento"],
      },
    }));
    expect(result.playbook.niche).toBe("implantes premium");
    expect(result.playbook.focusSignals).toEqual(["reviews", "hiring"]);
    expect(result.playbook.recommendedModules).toEqual(["crm", "agendamento"]);
  });
});
