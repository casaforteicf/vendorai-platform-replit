import type {
  MediaPlanCampaign,
  MediaPlanConteudo,
  MediaPlanConversionJourney,
} from "@workspace/db";
import {
  alignMediaFunctionsInContent as legacyAlignMediaFunctionsInContent,
  enrichMediaPlanForPeriod as legacyEnrichMediaPlanForPeriod,
} from "./media-plan-period-legacy.js";

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function conversionJourneyFor(campaign: MediaPlanCampaign): MediaPlanConversionJourney {
  if (campaign.jornadaConversao) return campaign.jornadaConversao;

  const phase = campaign.fase.toLocaleLowerCase("pt-BR");
  const objective = campaign.objetivo.toLocaleLowerCase("pt-BR");
  const interest = slug(campaign.produtoServico || campaign.nome);
  const isRemarketing = /remarketing|recuper|reativ|convers/.test(`${phase} ${objective}`);
  const isAcquisition = /aquisi|descob|alcance/.test(`${phase} ${objective}`);

  const audienceTags = isRemarketing
    ? ["returning_visitors", "pricing_visitors", "high_intent"]
    : isAcquisition
      ? ["all_site_visitors_30d"]
      : ["returning_visitors", "cta_engaged"];

  return {
    entrySignals: isAcquisition
      ? ["visitou site ou landing page", "interagiu com conteúdo/anúncio"]
      : ["retornou ao site", "visitou página de produto/serviço", "clicou em CTA"],
    audienceTags,
    sdrActivationScore: 60,
    opportunityScore: 80,
    nurtureMaterialTags: [
      "nurture",
      "stage:aquecimento",
      ...(interest ? [`interest:${interest}`] : []),
    ],
    followUpHours: [24, 72, 168],
    exitSignals: ["ganho", "sem_interesse", "opt_out", "fim_campanha"],
    reentryAllowed: true,
    notes: "A campanha tem começo e fim; o lead mantém histórico, score e interesses e pode entrar em outra campanha compatível depois.",
  };
}

function attachConversionJourneys(content: MediaPlanConteudo): MediaPlanConteudo {
  if (!content.campanhas?.length) return content;
  return {
    ...content,
    campanhas: content.campanhas.map((campaign) => ({
      ...campaign,
      jornadaConversao: conversionJourneyFor(campaign),
    })),
  };
}

export function alignMediaFunctionsInContent(content: MediaPlanConteudo): MediaPlanConteudo {
  return attachConversionJourneys(legacyAlignMediaFunctionsInContent(content));
}

export async function enrichMediaPlanForPeriod(
  tenantId: string,
  conteudoBase: MediaPlanConteudo,
  periodoDias: number,
): Promise<MediaPlanConteudo> {
  const content = await legacyEnrichMediaPlanForPeriod(tenantId, conteudoBase, periodoDias);
  return attachConversionJourneys(content);
}
