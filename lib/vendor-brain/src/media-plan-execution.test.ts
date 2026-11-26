import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_DURATION_SECONDS,
  MIN_VIDEO_DURATION_SECONDS,
  campaignNameFromPilar,
  contentPillarFromPilar,
  deriveOperationalState,
  findCampaignForItem,
  normalizeLabel,
  resolveAdDestination,
  resolveAdFlightWindow,
  resolveAdObjective,
  resolveVideoDurationSeconds,
  selectRoundRobinByTenant,
} from "./media-plan-execution";

const campaign = {
  id: "camp-1",
  nome: "Aquisição de novas oportunidades",
  objetivo: "Aquisição de novas oportunidades",
  produtoServico: "Pacote Tiradentes 2027",
  publico: "Famílias de Curitiba",
  oferta: "Reserve agora!",
  mensagemCentral: "Descanso de verdade perto de casa",
  kpiPrincipal: "CPL, CPA e ROAS",
  duracaoDias: 8,
  inicioOffsetDias: 5,
  fase: "aquisição",
  canais: [
    { canal: "Instagram", etapaFunil: "descoberta/consideração", kpiPrincipal: "alcance qualificado" },
    { canal: "Meta Ads", etapaFunil: "aquisição/remarketing/conversão", kpiPrincipal: "CPL, CPA e ROAS" },
    { canal: "Google Search", etapaFunil: "intenção/conversão", kpiPrincipal: "conversões e CPL" },
    { canal: "Landing Page", etapaFunil: "conversão", kpiPrincipal: "taxa de conversão e CPL" },
    { canal: "WhatsApp", etapaFunil: "conversão/relacionamento", kpiPrincipal: "taxa de resposta" },
  ],
};

const item = {
  id: "item-1",
  tipo: "meta_ad",
  canal: "Meta Ads",
  pilar: "Aquisição de novas oportunidades · conversão",
  temaSugerido: "Oferta de feriado",
  dataAgendada: "2026-11-02",
};

describe("pilar -> campanha", () => {
  it("extrai o nome da campanha do separador canônico", () => {
    expect(campaignNameFromPilar("Campanha A · prova")).toBe("Campanha A");
    expect(contentPillarFromPilar("Campanha A · prova")).toBe("prova");
  });

  it("tolera o separador legado corrompido sem perder o item", () => {
    expect(campaignNameFromPilar("Campanha A \uFFFD prova")).toBe("Campanha A");
  });

  it("mantém o texto inteiro quando não há separador", () => {
    expect(campaignNameFromPilar("Campanha A")).toBe("Campanha A");
    expect(contentPillarFromPilar("Campanha A")).toBe("Campanha A");
  });

  it("normaliza acentos e caixa", () => {
    expect(normalizeLabel("  Aquisição   de Novas  ")).toBe("aquisicao de novas");
  });

  it("encontra a campanha exata e não cai para outra campanha", () => {
    expect(findCampaignForItem([campaign, { ...campaign, id: "camp-2", nome: "Outra" }], item)?.id).toBe("camp-1");
    expect(findCampaignForItem([campaign], { ...item, pilar: "Campanha inexistente · prova" })).toBeNull();
  });
});

describe("parâmetros de anúncio derivados do plano", () => {
  it("usa lead quando o canal tem etapa de conversão com CPL", () => {
    expect(resolveAdObjective(campaign, { ...item, tipo: "search_ad", canal: "Google Search" })).toBe("lead");
  });

  it("usa sale quando o canal fala de ROAS/receita", () => {
    expect(resolveAdObjective({ ...campaign, kpiPrincipal: "ROAS e receita" }, item)).toBe("sale");
  });

  it("não deixa o ROAS global transformar descoberta em venda", () => {
    expect(resolveAdObjective(campaign, { ...item, tipo: "feed", canal: "Instagram" })).toBe("awareness");
  });

  it("usa whatsapp quando o canal é WhatsApp", () => {
    expect(resolveAdObjective(campaign, { ...item, canal: "WhatsApp" })).toBe("whatsapp");
  });

  it("prioriza landing page aprovada no plano", () => {
    expect(resolveAdDestination(campaign, item)).toBe("landing_page");
  });

  it("usa formulário quando não há LP e o objetivo é lead", () => {
    const withoutLandingPage = {
      ...campaign,
      canais: [{ canal: "Google Search", etapaFunil: "conversão", kpiPrincipal: "CPL" }],
    };
    expect(resolveAdDestination(withoutLandingPage, { ...item, tipo: "search_ad", canal: "Google Search" })).toBe("formulario_lead");
  });

  it("respeita whatsapp como destino apenas no canal de WhatsApp", () => {
    expect(resolveAdDestination(campaign, { ...item, canal: "WhatsApp" })).toBe("whatsapp");
  });
});

describe("duração e janela", () => {
  it("tem default documentado por formato, dentro dos limites do engine", () => {
    expect(resolveVideoDurationSeconds("reels")).toBe(DEFAULT_VIDEO_DURATION_SECONDS.reels);
    expect(resolveVideoDurationSeconds("youtube_video")).toBe(DEFAULT_VIDEO_DURATION_SECONDS.youtube_video);
    expect(resolveVideoDurationSeconds("desconhecido")).toBeGreaterThanOrEqual(MIN_VIDEO_DURATION_SECONDS);
    expect(resolveVideoDurationSeconds("desconhecido")).toBeLessThanOrEqual(MAX_VIDEO_DURATION_SECONDS);
  });

  it("respeita o offset e a duração da fase da campanha", () => {
    expect(resolveAdFlightWindow(campaign, "2026-10-20", "2026-10-20")).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-11-01",
    });
  });

  it("usa a data do item quando não há início de plano", () => {
    expect(resolveAdFlightWindow(campaign, null, "2026-10-20")).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-11-01",
    });
  });
});

describe("estado operacional único", () => {
  it("trata vídeo gerado sem arquivo final como em produção", () => {
    const state = deriveOperationalState({ calendarStatus: "gerado", hasGeneration: true, isVideo: true, hasFinalVideo: false });
    expect(state.code).toBe("producing");
    expect(state.label).toBe("Em produção");
  });

  it("trata vídeo gerado com arquivo final como em revisão", () => {
    expect(deriveOperationalState({ calendarStatus: "gerado", hasGeneration: true, isVideo: true, hasFinalVideo: true }).code).toBe("in_review");
  });

  it("distingue autorizado de aprovado", () => {
    expect(deriveOperationalState({ calendarStatus: "aprovado", hasGeneration: false }).code).toBe("authorized");
    expect(deriveOperationalState({ calendarStatus: "aprovado", hasGeneration: true }).code).toBe("approved");
  });

  it("publicação vence o estado do calendário", () => {
    expect(deriveOperationalState({ calendarStatus: "aprovado", hasGeneration: true, publicationStatus: "published" }).code).toBe("published");
    expect(deriveOperationalState({ calendarStatus: "aprovado", hasGeneration: true, publicationStatus: "scheduled" }).code).toBe("scheduled");
  });

  it("falha explícita tem precedência sobre aprovado", () => {
    expect(deriveOperationalState({ calendarStatus: "aprovado", hasGeneration: true, materializationStatus: "failed" }).code).toBe("failed");
  });

  it("reconhece o estado de produção em andamento", () => {
    expect(deriveOperationalState({ calendarStatus: "processando" }).code).toBe("producing");
    expect(deriveOperationalState({ calendarStatus: "aprovado", producing: true }).code).toBe("producing");
  });

  it("mapeia recusado, ignorado e planejado", () => {
    expect(deriveOperationalState({ calendarStatus: "recusado" }).code).toBe("rejected");
    expect(deriveOperationalState({ calendarStatus: "pulado" }).code).toBe("skipped");
    expect(deriveOperationalState({ calendarStatus: "planejado" }).code).toBe("planned");
  });
});

describe("lote justo entre tenants", () => {
  const rows = [
    { id: "a1", tenant: "A" },
    { id: "a2", tenant: "A" },
    { id: "a3", tenant: "A" },
    { id: "b1", tenant: "B" },
    { id: "c1", tenant: "C" },
    { id: "c2", tenant: "C" },
  ];

  it("alterna tenants antes de repetir o mesmo tenant", () => {
    const selected = selectRoundRobinByTenant(rows, (row) => row.tenant, 1, 3);
    expect(selected.map((row) => row.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("respeita o teto por tenant e o total", () => {
    const selected = selectRoundRobinByTenant(rows, (row) => row.tenant, 2, 5);
    expect(selected.map((row) => row.id)).toEqual(["a1", "b1", "c1", "a2", "c2"]);
  });

  it("devolve lote vazio quando o total é zero", () => {
    expect(selectRoundRobinByTenant(rows, (row) => row.tenant, 2, 0)).toEqual([]);
  });

  it("não perde tenants com um único item", () => {
    const selected = selectRoundRobinByTenant(rows, (row) => row.tenant, 10, 10);
    expect(new Set(selected.map((row) => row.tenant))).toEqual(new Set(["A", "B", "C"]));
    expect(selected).toHaveLength(rows.length);
  });
});
