/**
 * Pesquisador — primeiro dos 4 agentes do Content Autopilot (ver briefing
 * /areas/content-autopilot). Três responsabilidades:
 *  1. Analisar o site do tenant e extrair o tom de marca (Claude)
 *  2. Descobrir keywords a partir de termos-semente, com volume/dificuldade
 *     reais (DataForSEO)
 *  3. Pesquisar concorrência (top 10 orgânico do Google) pra uma keyword
 *     aprovada, servindo de base pro esboço do Criador
 *
 * Todas as chamadas pagas (DataForSEO) respeitam `teto_gasto_mensal` do
 * tenant — ver checkBudget. `gasto_acumulado` nunca é resetado automaticamente
 * nessa v1 (sem cron de virada de mês ainda); é acompanhamento cumulativo
 * simples enquanto o módulo está em fase de teste/trial.
 */
import { db, contentAutopilotConfigTable, contentAutopilotKeywordsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger.js";
import { keywordsForKeywords, serpOrganicTop, isDataForSeoConfigured } from "../lib/dataforseoClient.js";
import type { ContentAutopilotBrandTone, ContentAutopilotConfig } from "@workspace/db";

const FETCH_TIMEOUT_MS = 15_000;

export class OrcamentoExcedidoError extends Error {
  constructor(tetoGastoMensal: string, gastoAcumulado: string) {
    super(`Teto de gasto mensal (US$ ${tetoGastoMensal}) atingido — gasto acumulado: US$ ${gastoAcumulado}`);
    this.name = "OrcamentoExcedidoError";
  }
}

async function checkBudget(config: ContentAutopilotConfig) {
  if (config.tetoGastoMensal == null) return; // sem teto configurado, não bloqueia
  const teto = Number(config.tetoGastoMensal);
  const gasto = Number(config.gastoAcumulado);
  if (gasto >= teto) {
    throw new OrcamentoExcedidoError(config.tetoGastoMensal, config.gastoAcumulado);
  }
}

async function addSpend(tenantId: string, cost: number) {
  if (cost <= 0) return;
  await db
    .update(contentAutopilotConfigTable)
    .set({ gastoAcumulado: sql`${contentAutopilotConfigTable.gastoAcumulado} + ${cost}`, updatedAt: new Date() })
    .where(eq(contentAutopilotConfigTable.tenantId, tenantId));
}

export async function getConfig(tenantId: string): Promise<ContentAutopilotConfig | null> {
  const [row] = await db
    .select()
    .from(contentAutopilotConfigTable)
    .where(eq(contentAutopilotConfigTable.tenantId, tenantId));
  return row ?? null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSiteText(siteUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(siteUrl, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; VendorAI-ContentAutopilot/1.0)" } });
    if (!res.ok) throw new Error(`Site respondeu ${res.status}`);
    const html = await res.text();
    return stripHtml(html).slice(0, 15_000); // suficiente pra Claude entender tom sem estourar contexto
  } finally {
    clearTimeout(timeout);
  }
}

/** Analisa o site do tenant e extrai o tom de marca via Claude. Salva em content_autopilot_config. */
export async function analyzeSiteTone(tenantId: string, siteUrl: string): Promise<ContentAutopilotBrandTone> {
  const siteText = await fetchSiteText(siteUrl);
  if (!siteText || siteText.length < 100) {
    throw new Error("Não consegui extrair conteúdo suficiente do site pra analisar o tom");
  }

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "Você analisa o texto de um site institucional e extrai o tom de marca em JSON puro, sem markdown, sem comentário. " +
      'Formato exato: {"tom": "descrição curta do tom (ex: direto e consultivo, sem jargão)", "vocabulario": ["termos", "recorrentes", "do", "site"], "publicoAlvo": "quem o site parece querer atingir", "exemplos": ["1-2 frases reais do site que ilustram o tom"]}',
    messages: [{ role: "user", content: `Texto extraído do site:\n\n${siteText}` }],
  });
  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Resposta da IA sem texto");

  let brandTone: ContentAutopilotBrandTone;
  try {
    brandTone = JSON.parse(textBlock.text.trim());
  } catch {
    throw new Error("IA não retornou JSON válido pro tom de marca");
  }

  await db
    .update(contentAutopilotConfigTable)
    .set({ brandTone, ultimaAnaliseSiteEm: new Date(), updatedAt: new Date() })
    .where(eq(contentAutopilotConfigTable.tenantId, tenantId));

  return brandTone;
}

export interface KeywordDiscoveryResult {
  inseridas: number;
  jaExistiam: number;
  custoUsd: number;
}

/** Descobre keywords a partir de termos-semente (DataForSEO) e insere as novas na tabela. */
export async function discoverKeywords(tenantId: string, seedKeywords: string[]): Promise<KeywordDiscoveryResult> {
  if (!isDataForSeoConfigured()) {
    throw new Error("DataForSEO não configurado (DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD ausentes)");
  }
  const config = await getConfig(tenantId);
  if (!config) throw new Error("Tenant sem configuração do Content Autopilot — crie a config primeiro");
  await checkBudget(config);

  const { keywords, cost } = await keywordsForKeywords(seedKeywords);
  await addSpend(tenantId, cost);
  logger.info({ tenantId, seedKeywords, encontradas: keywords.length, custoUsd: cost }, "content-autopilot: keywordsForKeywords");

  if (keywords.length === 0) return { inseridas: 0, jaExistiam: 0, custoUsd: cost };

  let inseridas = 0;
  for (const kw of keywords) {
    const result = await db
      .insert(contentAutopilotKeywordsTable)
      .values({
        tenantId,
        termo: kw.keyword,
        volumeBusca: kw.searchVolume,
        dificuldade:
          typeof kw.competition === "number" && Number.isFinite(kw.competition) ? String(Math.round(kw.competition * 100)) : null,
        tipo: null,
        status: "descoberta",
        fonte: "dataforseo",
      })
      .onConflictDoNothing({ target: [contentAutopilotKeywordsTable.tenantId, contentAutopilotKeywordsTable.termo] })
      .returning({ id: contentAutopilotKeywordsTable.id });
    if (result.length > 0) inseridas++;
  }

  return { inseridas, jaExistiam: keywords.length - inseridas, custoUsd: cost };
}

/** Pesquisa o top 10 orgânico do Google pra uma keyword já cadastrada e salva o resultado nela. */
export async function researchCompetitors(tenantId: string, keywordId: string) {
  if (!isDataForSeoConfigured()) {
    throw new Error("DataForSEO não configurado (DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD ausentes)");
  }
  const config = await getConfig(tenantId);
  if (!config) throw new Error("Tenant sem configuração do Content Autopilot — crie a config primeiro");
  await checkBudget(config);

  const [keywordRow] = await db
    .select()
    .from(contentAutopilotKeywordsTable)
    .where(and(eq(contentAutopilotKeywordsTable.id, keywordId), eq(contentAutopilotKeywordsTable.tenantId, tenantId)));
  if (!keywordRow) throw new Error("Keyword não encontrada pra esse tenant");

  const { results, cost } = await serpOrganicTop(keywordRow.termo);
  await addSpend(tenantId, cost);
  logger.info({ tenantId, keywordId, termo: keywordRow.termo, encontrados: results.length, custoUsd: cost }, "content-autopilot: serpOrganicTop");

  await db
    .update(contentAutopilotKeywordsTable)
    .set({ serpTop10: results, serpColetadoEm: new Date() })
    .where(eq(contentAutopilotKeywordsTable.id, keywordId));

  return { results, custoUsd: cost };
}
