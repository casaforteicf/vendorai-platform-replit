// Loop de aprendizado com métricas dos próprios posts — inspirado no
// Dalea AI ("metrics turn into learning: what worked, where to improve,
// what's worth trying again"). Diferente dos criadores de referência
// (Business Discovery, API mais nova e incerta), isso usa a API de
// Insights padrão do Instagram Graph pra dados do PRÓPRIO tenant — API
// "me and mine" oficial e estável, sem a mesma incerteza técnica.
import { and, eq, isNull, lt, or } from "drizzle-orm";
import {
  db,
  contentPublishedPostsTable,
  contentPerformanceInsightsTable,
  agentConfigsTable,
  type PostMetricas,
  type PerformanceAprendizados,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
// Insights do Instagram só estabiliza depois de um tempo publicado —
// buscar antes disso retorna número parcial/enganoso.
const MIN_AGE_BEFORE_METRICS_HOURS = 24;
const MIN_POSTS_FOR_ANALYSIS = 4;

export class PerformanceError extends Error {}

export async function registerPublishedPost(params: {
  tenantId: string;
  contentGenerationId?: string;
  variationIndex: number;
  instagramMediaId: string;
  contentType: string;
  theme?: string;
  captionOuTexto?: string;
}) {
  await db.insert(contentPublishedPostsTable).values({
    tenantId: params.tenantId,
    contentGenerationId: params.contentGenerationId ?? null,
    variationIndex: params.variationIndex,
    instagramMediaId: params.instagramMediaId,
    contentType: params.contentType,
    theme: params.theme ?? null,
    captionOuTexto: params.captionOuTexto ?? null,
  });
}

export async function listPublishedPosts(tenantId: string) {
  return db
    .select()
    .from(contentPublishedPostsTable)
    .where(eq(contentPublishedPostsTable.tenantId, tenantId))
    .orderBy(contentPublishedPostsTable.publishedAt);
}

async function fetchMediaMetrics(mediaId: string, accessToken: string, contentType: string): Promise<PostMetricas> {
  // Métricas disponíveis variam por tipo de mídia na API do Instagram —
  // Stories não tem 'saved', por exemplo. Pede um conjunto amplo e
  // ignora as que a própria API rejeitar pra esse media, em vez de
  // falhar a coleta inteira por causa de 1 métrica indisponível.
  const metricSet = contentType === "stories" ? "reach,replies" : "reach,likes,comments,saved,shares";
  const url = new URL(`${GRAPH_BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", metricSet);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new PerformanceError(`Instagram não retornou métricas pra esse post (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: { name: string; values: { value: number }[] }[] };
  const metricas: PostMetricas = {};
  for (const m of data.data ?? []) {
    const value = m.values?.[0]?.value;
    if (typeof value !== "number") continue;
    if (m.name === "reach") metricas.reach = value;
    if (m.name === "likes") metricas.likes = value;
    if (m.name === "comments") metricas.comments = value;
    if (m.name === "saved") metricas.saved = value;
    if (m.name === "shares") metricas.shares = value;
  }
  return metricas;
}

// Roda sob demanda (botão "Atualizar métricas") — busca métricas só dos
// posts publicados há mais de 24h que ainda não têm coleta bem-sucedida
// nas últimas 24h, pra não bater na API à toa.
export async function refreshPendingMetrics(tenantId: string): Promise<{ atualizados: number; erros: number }> {
  const [config] = await db
    .select({ token: agentConfigsTable.instagramPageAccessToken })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config?.token) {
    throw new PerformanceError("Instagram não conectado (Configurações → Instagram) — sem isso não dá pra buscar métricas dos posts.");
  }

  const cutoff = new Date(Date.now() - MIN_AGE_BEFORE_METRICS_HOURS * 60 * 60 * 1000);
  const posts = await db
    .select()
    .from(contentPublishedPostsTable)
    .where(
      and(
        eq(contentPublishedPostsTable.tenantId, tenantId),
        lt(contentPublishedPostsTable.publishedAt, cutoff),
        or(isNull(contentPublishedPostsTable.ultimaColetaEm), lt(contentPublishedPostsTable.ultimaColetaEm, cutoff)),
      ),
    );

  let atualizados = 0;
  let erros = 0;
  for (const post of posts) {
    try {
      const metricas = await fetchMediaMetrics(post.instagramMediaId, config.token, post.contentType);
      await db
        .update(contentPublishedPostsTable)
        .set({ metricas, ultimaColetaEm: new Date(), ultimoErroMetricas: null })
        .where(eq(contentPublishedPostsTable.id, post.id));
      atualizados++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      await db
        .update(contentPublishedPostsTable)
        .set({ ultimaColetaEm: new Date(), ultimoErroMetricas: message })
        .where(eq(contentPublishedPostsTable.id, post.id));
      logger.error({ err, tenantId, postId: post.id }, "content-performance: falha ao coletar métricas");
      erros++;
    }
  }
  return { atualizados, erros };
}

const ANALYSIS_SYSTEM_PROMPT = `Você analisa o desempenho dos posts recentes de uma marca no Instagram (dados
reais dela mesma, não de terceiros) e extrai aprendizados pra guiar a
próxima geração de conteúdo. Responda APENAS com um objeto JSON válido,
sem markdown, no formato exato:
{
  "temasQueFuncionam": string[] (2 a 5 temas/abordagens com engajamento acima da média),
  "temasQueNaoFuncionam": string[] (0 a 3 temas/abordagens com engajamento abaixo da média — vazio se não der pra distinguir),
  "formatoQueMaisEngaja": string (ex: "Reels com gancho de pergunta", "Feed com prova social"),
  "observacoes": string (1-2 frases com o principal aprendizado acionável)
}
Compare relativamente entre os posts fornecidos (não existe "número bom" absoluto). Nunca invente dado que não esteja na lista.`;

export async function getPerformanceInsights(tenantId: string) {
  const [row] = await db
    .select()
    .from(contentPerformanceInsightsTable)
    .where(eq(contentPerformanceInsightsTable.tenantId, tenantId));
  return row ?? null;
}

// Roda sob demanda (botão "Atualizar aprendizados") — precisa de pelo
// menos MIN_POSTS_FOR_ANALYSIS posts com métricas coletadas, senão a
// comparação relativa não tem base nenhuma.
export async function refreshPerformanceInsights(tenantId: string) {
  const posts = await listPublishedPosts(tenantId);
  const comMetricas = posts.filter((p) => p.metricas && Object.keys(p.metricas).length > 0);

  if (comMetricas.length < MIN_POSTS_FOR_ANALYSIS) {
    throw new PerformanceError(
      `Ainda faltam posts com métricas coletadas (${comMetricas.length}/${MIN_POSTS_FOR_ANALYSIS}). Publique mais conteúdo e clique em "Atualizar métricas" depois de ~24h.`,
    );
  }

  const resumo = comMetricas
    .map((p) => {
      const m = p.metricas!;
      const engajamento = (m.likes ?? 0) + (m.comments ?? 0) * 2 + (m.saved ?? 0) * 3 + (m.shares ?? 0) * 3;
      return `Tema "${p.theme ?? "?"}" (${p.contentType}): alcance ${m.reach ?? "?"}, curtidas ${m.likes ?? "?"}, comentários ${m.comments ?? "?"}, salvos ${m.saved ?? "?"}, compartilhamentos ${m.shares ?? "?"} — score engajamento ~${engajamento}. Legenda: ${(p.captionOuTexto ?? "").slice(0, 200)}`;
    })
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: resumo }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
  if (!raw) throw new PerformanceError("IA não retornou análise — tente novamente.");
  const aprendizados = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) as PerformanceAprendizados;

  const [saved] = await db
    .insert(contentPerformanceInsightsTable)
    .values({ tenantId, aprendizados, baseadoEmPosts: comMetricas.length, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: contentPerformanceInsightsTable.tenantId,
      set: { aprendizados, baseadoEmPosts: comMetricas.length, atualizadoEm: new Date(), updatedAt: new Date() },
    })
    .returning();

  logger.info({ tenantId, baseadoEmPosts: comMetricas.length }, "content-performance: aprendizados atualizados");
  return saved!;
}

// Monta o bloco de texto injetado no prompt de geração de conteúdo — só
// usa se já existir análise (não bloqueia geração enquanto não há dados
// suficientes, só não adiciona esse contexto extra).
export async function buildOwnPerformancePromptBlock(tenantId: string): Promise<string> {
  const insight = await getPerformanceInsights(tenantId);
  if (!insight?.aprendizados) return "";
  const a = insight.aprendizados;

  return `\n## Aprendizados dos posts publicados desta marca (dados reais de desempenho, baseado em ${insight.baseadoEmPosts} posts)\nTemas que funcionam melhor: ${a.temasQueFuncionam.join(", ")}.${a.temasQueNaoFuncionam.length ? ` Temas com engajamento mais fraco (evite ou reformule): ${a.temasQueNaoFuncionam.join(", ")}.` : ""} Formato que mais engaja: ${a.formatoQueMaisEngaja}. ${a.observacoes}\n`;
}
