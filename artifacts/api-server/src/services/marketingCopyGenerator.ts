import { callOpenAI } from "../lib/ai-gateway.js";

/**
 * Geração de copy (headline, apoio e CTA) com IA para uma peça do Plano de Mídia.
 *
 * Usada em dois momentos:
 * - automática, logo após produzir a peça (worker/tela), para a revisão já abrir
 *   com texto pronto;
 * - sob demanda, no botão "Gerar texto com IA" da revisão.
 *
 * O contexto é sempre a campanha exata do item (sem fallback para outra
 * campanha). Falha de IA nunca deve derrubar a produção de mídia: o chamador
 * decide se ignora ou propaga.
 */

export interface MarketingCopyCampaign {
  nome?: string | null;
  objetivo?: string | null;
  produtoServico?: string | null;
  publico?: string | null;
  regiao?: string | null;
  oferta?: string | null;
  mensagemCentral?: string | null;
  kpiPrincipal?: string | null;
}

export interface MarketingCopyItem {
  temaSugerido?: string | null;
  canal?: string | null;
  tipo?: string | null;
  dataAgendada?: string | null;
}

export interface MarketingCopy {
  headline: string;
  supportingText: string;
  cta: string;
}

const SYSTEM_PROMPT = `Você é redator sênior de marketing de uma agência.
Escreva copy pronta para publicação, específica para a campanha, o canal e o tema recebidos.
Regras: português do Brasil, sem inventar preços/prazos/dados, sem emoji, sem hashtag,
sem repetir o enunciado do briefing. Responda SOMENTE JSON válido no formato:
{"headline": "...", "supportingText": "...", "cta": "..."}
- headline: no máximo 70 caracteres, concreta e orientada a benefício.
- supportingText: 1 a 2 frases (até 140 caracteres), sem repetir a headline.
- cta: 3 a 6 palavras, verbo de ação.`;

export function normalizeMarketingCopy(parsed: { headline?: unknown; supportingText?: unknown; cta?: unknown }): MarketingCopy | null {
  const headline = typeof parsed.headline === "string" ? parsed.headline.trim().slice(0, 80) : "";
  const supportingText = typeof parsed.supportingText === "string" ? parsed.supportingText.trim().slice(0, 140) : "";
  const cta = typeof parsed.cta === "string" ? parsed.cta.trim().slice(0, 60) : "";
  if (!headline || !cta) return null;
  return { headline, supportingText, cta };
}

export async function generateMarketingCopy(input: {
  tenantId: string;
  campaign: MarketingCopyCampaign | null | undefined;
  item: MarketingCopyItem;
  temperature?: number;
}): Promise<MarketingCopy | null> {
  const campaign = input.campaign;
  const context = [
    `Tema da peça: ${input.item.temaSugerido ?? ""}`,
    `Canal: ${input.item.canal ?? ""}`,
    `Formato: ${input.item.tipo ?? ""}`,
    input.item.dataAgendada ? `Data prevista: ${input.item.dataAgendada}` : "",
    campaign?.nome ? `Campanha: ${campaign.nome}` : "",
    campaign?.objetivo ? `Objetivo: ${campaign.objetivo}` : "",
    campaign?.produtoServico ? `Produto/serviço: ${campaign.produtoServico}` : "",
    campaign?.publico ? `Público: ${campaign.publico}` : "",
    campaign?.regiao ? `Região: ${campaign.regiao}` : "",
    campaign?.oferta ? `Oferta: ${campaign.oferta}` : "",
    campaign?.mensagemCentral ? `Mensagem central: ${campaign.mensagemCentral}` : "",
    campaign?.kpiPrincipal ? `KPI principal: ${campaign.kpiPrincipal}` : "",
  ].filter(Boolean).join("\n");

  const result = await callOpenAI(input.tenantId, "content_generator", [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context },
  ], {
    model: "gpt-4o-mini",
    temperature: input.temperature ?? 0.8,
    maxTokens: 400,
    responseFormat: { type: "json_object" },
  });

  const raw = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return normalizeMarketingCopy(JSON.parse(raw) as { headline?: unknown; supportingText?: unknown; cta?: unknown });
}
