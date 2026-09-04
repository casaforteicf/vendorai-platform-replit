import { describe, expect, it } from "vitest";
import {
  alignMediaChannelFunction,
  mediaActionFunction,
  resolveMediaChannelFunction,
} from "./media-channel-functions.js";

describe("funções oficiais das mídias", () => {
  it("diferencia mídia orgânica de mídia paga mesmo com aliases sobrepostos", () => {
    expect(resolveMediaChannelFunction("Instagram")?.canal).toBe("Instagram");
    expect(resolveMediaChannelFunction("Instagram Ads")?.canal).toBe("Meta Ads");
    expect(resolveMediaChannelFunction("Facebook")?.canal).toBe("Facebook");
    expect(resolveMediaChannelFunction("Facebook Ads")?.canal).toBe("Meta Ads");
  });

  it.each([
    ["Instagram", "Reels", "descoberta"],
    ["Instagram", "Carrossel", "educação"],
    ["Instagram", "Stories", "relacionamento"],
    ["Instagram", "Feed", "prova"],
    ["Google Search", "Anúncio de pesquisa", "intenção"],
    ["Google Display", "Display responsivo", "remarketing"],
    ["Landing Page", "Landing Page", "conversão"],
    ["WhatsApp", "Qualificação", "qualificação"],
    ["WhatsApp", "Follow-up", "relacionamento"],
    ["E-mail", "Reativação", "remarketing"],
    ["SMS", "Lembrete", "relacionamento"],
  ])("atribui %s / %s à função %s", (canal, formato, esperado) => {
    expect(mediaActionFunction(canal, formato).pilar).toBe(esperado);
  });

  it("corrige função, etapa, formato, frequência e KPI vindos incorretos da IA", () => {
    const aligned = alignMediaChannelFunction({
      canal: "Google Search",
      funcao: "awareness genérico",
      etapaFunil: "descoberta",
      formatos: ["Post"],
      frequencia: "3 posts por semana",
      quantidadeMateriais: 5,
      kpiPrincipal: "curtidas",
    }, { phase: "conversão", objective: "fechar novos contratos" });

    expect(aligned.funcao).toContain("alta intenção");
    expect(aligned.etapaFunil).toBe("intenção/conversão");
    expect(aligned.formatos).toContain("Anúncio de pesquisa");
    expect(aligned.frequencia).toContain("Sempre ativo");
    expect(aligned.kpiPrincipal).toContain("CPL/CPA");
    expect(aligned.quantidadeMateriais).toBe(5);
  });

  it("adapta o papel do mesmo canal à fase da campanha sem trocar a natureza do canal", () => {
    const remarketing = alignMediaChannelFunction({
      canal: "Meta Ads",
      funcao: "",
      etapaFunil: "",
      formatos: [],
      frequencia: "",
      quantidadeMateriais: 4,
      kpiPrincipal: "",
    }, { phase: "remarketing e recuperação", objective: "recuperar visitantes" });

    expect(remarketing.funcao).toContain("Recuperação");
    expect(remarketing.etapaFunil).toBe("aquisição/remarketing/conversão");
    expect(remarketing.formatos).toContain("Lead Ads");
  });
});
