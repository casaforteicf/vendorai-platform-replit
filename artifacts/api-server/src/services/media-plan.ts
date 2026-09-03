/**
 * Plano de mídia automático -- pedido real: "colocar as informações do @,
 * o site, segmento, região, concorrentes (as informações do cadastro
 * inicial) e gerar um planejamento pra mídias, buscando maneiras de
 * vitalizar o negócio pela internet".
 *
 * Junta o perfil do negócio já cadastrado (business_profiles) com dados
 * REAIS de busca (DataForSEO, já configurado e usado pelo Content
 * Autopilot) -- volume de busca de verdade pros termos do negócio, e quem
 * está aparecendo no Google pra esses termos (concorrência real, não só
 * o que o tenant informou) -- e pede pra IA montar um plano estratégico.
 */
import { db, businessProfilesTable, mediaPlansTable, type MediaPlanConteudo } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { isDataForSeoConfigured, keywordsForKeywords, serpOrganicTop, logDataForSeoCost } from "../lib/dataforseoClient.js";
import { logger } from "../lib/logger.js";

const SYSTEM_PROMPT = `Você é um estrategista de marketing digital especializado em pequenas e médias empresas brasileiras.
Recebe o perfil de um negócio (segmento, público-alvo, diferenciais, concorrentes, canais já usados) e, quando disponíveis,
dados reais de busca (volume de pesquisa de termos do negócio e quem aparece no Google pra esses termos).

Monte um plano de mídia realista e acionável -- nada de "publique todo dia em todas as redes", seja específico ao segmento
e ao tamanho real do negócio (não assuma orçamento de grande empresa). Priorize 2-4 canais no máximo, com motivo claro
pra cada um baseado no perfil recebido.

Retorne APENAS um JSON válido (sem markdown, comentários ou texto fora dele), exatamente com estas chaves:
{
  "diagnostico": "2-3 frases sobre a situação atual da presença online do negócio, baseado no que foi informado",
  "pontosFortesAtuais": ["ponto forte 1", "ponto forte 2"],
  "oportunidades": ["oportunidade concreta 1", "oportunidade concreta 2", "oportunidade concreta 3"],
  "canais": [
    {
      "canal": "Instagram",
      "prioridade": "alta",
      "motivo": "por que esse canal faz sentido pra ESSE negócio especificamente",
      "tiposCampanhaSugeridos": ["tipo 1", "tipo 2"],
      "percentualOrcamento": 40
    }
  ],
  "pilaresConteudo": ["pilar de conteúdo 1", "pilar de conteúdo 2", "pilar de conteúdo 3"],
  "acoesImediatas": ["ação concreta que dá pra fazer essa semana 1", "ação 2", "ação 3", "ação 4"]
}

Regras obrigatórias do JSON:
- "prioridade" deve ser exatamente "alta", "media" ou "baixa".
- "percentualOrcamento" deve ser um número entre 0 e 100, sem símbolo de %, e os canais devem somar aproximadamente 100.
- Não use trailing commas, comentários, tipos TypeScript ou valores como "número".
- Todas as listas devem ser arrays JSON e todas as chaves devem estar presentes.`;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function requirePriority(value: unknown): "alta" | "media" | "baixa" {
  if (value === "alta" || value === "media" || value === "baixa") {
    return value;
  }
  throw new Error("Prioridade inválida");
}

function requireBudget(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Percentual de orçamento inválido");
  }
  return parsed;
}

function parseJsonObject(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch (firstError) {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw firstError;
    }
    return JSON.parse(stripped.slice(start, end + 1));
  }
}

function parseMediaPlan(raw: string): MediaPlanConteudo {
  const parsed = parseJsonObject(raw);
  if (!isRecord(parsed)) {
    throw new Error("Plano não é um objeto JSON");
  }

  if (!Array.isArray(parsed.canais) || parsed.canais.length === 0) {
    throw new Error("Campo inválido: canais");
  }

  const canais = parsed.canais.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Canal inválido: ${index}`);
    }
    return {
      canal: requireString(item.canal, `canais[${index}].canal`),
      prioridade: requirePriority(item.prioridade),
      motivo: requireString(item.motivo, `canais[${index}].motivo`),
      tiposCampanhaSugeridos: requireStringArray(item.tiposCampanhaSugeridos, `canais[${index}].tiposCampanhaSugeridos`),
      percentualOrcamento: requireBudget(item.percentualOrcamento),
    };
  });

  return {
    diagnostico: requireString(parsed.diagnostico, "diagnostico"),
    pontosFortesAtuais: requireStringArray(parsed.pontosFortesAtuais, "pontosFortesAtuais"),
    oportunidades: requireStringArray(parsed.oportunidades, "oportunidades"),
    canais,
    pilaresConteudo: requireStringArray(parsed.pilaresConteudo, "pilaresConteudo"),
    acoesImediatas: requireStringArray(parsed.acoesImediatas, "acoesImediatas"),
    keywordsRelevantes: [],
    concorrentesEncontrados: [],
  } as MediaPlanConteudo;
}

function buildProfileContext(profile: {
  razaoSocial: string;
  nomeFantasia: string | null;
  vertical: string | null;
  endereco: string | null;
  publicoAlvo: string | null;
  diferenciais: string | null;
  concorrentes: string[] | null;
  canaisVenda: string[] | null;
  instagramUrl: string | null;
  produtos: { nome: string; descricao?: string }[] | null;
}): string {
  const lines: string[] = [
    `Negócio: ${profile.nomeFantasia ?? profile.razaoSocial}`,
  ];
  if (profile.vertical) lines.push(`Segmento: ${profile.vertical}`);
  if (profile.endereco) lines.push(`Localização: ${profile.endereco}`);
  if (profile.publicoAlvo) lines.push(`Público-alvo: ${profile.publicoAlvo}`);
  if (profile.diferenciais) lines.push(`Diferenciais: ${profile.diferenciais}`);
  if (profile.concorrentes?.length) lines.push(`Concorrentes informados pelo negócio: ${profile.concorrentes.join(", ")}`);
  if (profile.canaisVenda?.length) lines.push(`Canais de venda já usados: ${profile.canaisVenda.join(", ")}`);
  if (profile.instagramUrl) lines.push(`Instagram: ${profile.instagramUrl}`);
  if (profile.produtos?.length) lines.push(`Produtos/serviços: ${profile.produtos.map((p) => p.nome).slice(0, 10).join(", ")}`);
  return lines.join("\n");
}

export class MediaPlanError extends Error {}

export async function generateMediaPlan(tenantId: string, geradoPor: string | null): Promise<{
  plan: typeof mediaPlansTable.$inferSelect;
}> {
  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  if (!profile) {
    throw new MediaPlanError("Complete o perfil do negócio (Configurações → Perfil do Negócio) antes de gerar o plano de mídia.");
  }

  let custoTotal = 0;
  let keywordsRelevantes: MediaPlanConteudo["keywordsRelevantes"] = [];
  let concorrentesEncontrados: MediaPlanConteudo["concorrentesEncontrados"] = [];

  // Dados reais de busca -- best-effort: se não estiver configurado ou
  // falhar, segue só com o perfil (não bloqueia a geração do plano).
  if (isDataForSeoConfigured()) {
    try {
      const produtosNomes = (profile.produtos as { nome: string }[] | null)?.map((p) => p.nome) ?? [];
      const seeds = [profile.vertical, ...produtosNomes].filter((s): s is string => Boolean(s)).slice(0, 3);
      if (seeds.length > 0) {
        const { keywords, cost } = await keywordsForKeywords(seeds, { limit: 10 });
        custoTotal += cost;
        keywordsRelevantes = keywords.slice(0, 8).map((k) => ({ termo: k.keyword, volumeBusca: k.searchVolume }));

        const termoPrincipal = seeds[0];
        if (termoPrincipal) {
          const { results, cost: serpCost } = await serpOrganicTop(termoPrincipal, { maxResults: 5 });
          custoTotal += serpCost;
          concorrentesEncontrados = results.map((r) => ({ dominio: r.domain, titulo: r.title, url: r.url }));
        }
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "media-plan: falha ao buscar dados reais (DataForSEO) — seguindo só com o perfil");
    }
  }

  const contextoTexto = [
    buildProfileContext(profile),
    keywordsRelevantes.length > 0
      ? `\nVolume de busca real (Google, últimos dados disponíveis) pros termos do negócio:\n${keywordsRelevantes.map((k) => `- "${k.termo}": ${k.volumeBusca ?? "?"} buscas/mês`).join("\n")}`
      : "",
    concorrentesEncontrados.length > 0
      ? `\nQuem aparece hoje no Google pro termo principal do negócio (concorrência real de visibilidade):\n${concorrentesEncontrados.map((c) => `- ${c.dominio} — "${c.titulo}"`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contextoTexto }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
  if (!raw) throw new MediaPlanError("IA não retornou o plano — tente novamente.");

  let conteudo: MediaPlanConteudo;
  try {
    conteudo = parseMediaPlan(raw);
  } catch (err) {
    logger.warn({ err, tenantId }, "media-plan: resposta da IA fora do formato esperado");
    throw new MediaPlanError("Falha ao interpretar o plano gerado — tente novamente.");
  }
  conteudo.keywordsRelevantes = keywordsRelevantes;
  conteudo.concorrentesEncontrados = concorrentesEncontrados;

  logDataForSeoCost({ tenantId, feature: "media_plan" }, custoTotal);

  const [plan] = await db
    .insert(mediaPlansTable)
    .values({
      tenantId,
      conteudo,
      contextoUsado: { profileSnapshot: contextoTexto },
      custoUsd: custoTotal.toFixed(4),
      geradoPor,
    })
    .returning();

  return { plan: plan! };
}
