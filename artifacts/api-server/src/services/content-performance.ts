// Loop de aprendizado com métricas dos próprios posts — inspirado no
// Dalea AI ("metrics turn into learning: what worked, where to improve,
// what's worth trying again"). Diferente dos criadores de referência
// (Business Discovery, API mais nova e incerta), isso usa a API de
// Insights padrão do Instagram Graph pra dados do PRÓPRIO tenant.
import { and, eq, isNull, lt, or } from "drizzle-orm";
import {
  db,
  contentCalendarItemsTable,
  contentGenerationsTable,
  contentPublishedPostsTable,
  contentPerformanceInsightsTable,
  agentConfigsTable,
  instagramConnectionsTable,
  type PerformanceAprendizados,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger.js";
import { buildPaidMediaLearningPromptBlock } from "./paidMediaLearning.js";
import { collectInstagramInsights } from "./instagram-insight-collector.js";

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
  instagramConnectionId?: string;
}) {
  await db.insert(contentPublishedPostsTable).values({
    tenantId: params.tenantId,
    contentGenerationId: params.contentGenerationId ?? null,
    variationIndex: params.variationIndex,
    instagramMediaId: params.instagramMediaId,
    contentType: params.contentType,
    theme: params.theme ?? null,
    captionOuTexto: params.captionOuTexto ?? null,
    instagramConnectionId: params.instagramConnectionId ?? null,
  });
}

export async function listPublishedPosts(tenantId: string) {
  return db
    .select()
    .from(contentPublishedPostsTable)
    .where(eq(contentPublishedPostsTable.tenantId, tenantId))
    .orderBy(contentPublishedPostsTable.publishedAt);
}

export async function refreshPendingMetrics(tenantId: string, instagramConnectionId?: string): Promise<{ atualizados: number; erros: number }> {
  const [[directConnection], [legacyConfig]] = await Promise.all([
    db
      .select({
        token: instagramConnectionsTable.pageAccessToken,
        disconnectedAt: instagramConnectionsTable.disconnectedAt,
        tokenExpiresAt: instagramConnectionsTable.tokenExpiresAt,
      })
      .from(instagramConnectionsTable)
      .where(instagramConnectionId
        ? and(eq(instagramConnectionsTable.tenantId, tenantId), eq(instagramConnectionsTable.id, instagramConnectionId))
        : eq(instagramConnectionsTable.tenantId, tenantId))
      .limit(1),
    db
      .select({ token: agentConfigsTable.instagramPageAccessToken })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1),
  ]);
  const directTokenExpired = Boolean(directConnection?.tokenExpiresAt && directConnection.tokenExpiresAt <= new Date());
  const directReady = Boolean(directConnection && !directConnection.disconnectedAt && !directTokenExpired && directConnection.token);
  const token = directReady ? directConnection?.token : legacyConfig?.token;
  if (!token) {
    throw new PerformanceError(
      directTokenExpired
        ? "A conexão do Instagram expirou. Reconecte em Configurações → Integrações antes de atualizar as métricas."
        : "Instagram não conectado (Configurações → Integrações) — sem isso não dá pra buscar métricas dos posts.",
    );
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
        ...(instagramConnectionId ? [eq(contentPublishedPostsTable.instagramConnectionId, instagramConnectionId)] : []),
      ),
    );

  let atualizados = 0;
  let erros = 0;
  for (const post of posts) {
    try {
      const metricas = await collectInstagramInsights(post.instagramMediaId, token, post.contentType);
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
próxima geração de conteúdo e o próximo ciclo do Plano de Mídia. Quando houver
contexto de plano/campanha/canal/ação, use-o para distinguir em qual estratégia
o resultado ocorreu; não atribua causalidade quando os dados não permitirem.
Responda APENAS com um objeto JSON válido,
sem markdown, no formato exato:
{
  "temasQueFuncionam": string[] (2 a 5 temas/abordagens com engajamento acima da média),
  "temasQueNaoFuncionam": string[] (0 a 3 temas/abordagens com engajamento abaixo da média — vazio se não der pra distinguir),
  "formatoQueMaisEngaja": string (ex: "Reels com gancho de pergunta", "Feed com prova social"),
  "observacoes": string (1-2 frases com o principal aprendizado acionável; cite campanha/canal quando esse contexto estiver disponível)
}
Compare relativamente entre os posts fornecidos. Nunca invente dado que não esteja na lista.`;

export async function getPerformanceInsights(tenantId: string) {
  const [row] = await db
    .select()
    .from(contentPerformanceInsightsTable)
    .where(eq(contentPerformanceInsightsTable.tenantId, tenantId));
  return row ?? null;
}

export async function refreshPerformanceInsights(tenantId: string) {
  const posts = await listPublishedPosts(tenantId);
  const comMetricas = posts.filter((p) => p.metricas && Object.keys(p.metricas).length > 0);

  if (comMetricas.length < MIN_POSTS_FOR_ANALYSIS) {
    throw new PerformanceError(
      `Ainda faltam posts com métricas coletadas (${comMetricas.length}/${MIN_POSTS_FOR_ANALYSIS}). A coleta é automática após ~24h e o aprendizado será atualizado quando houver volume suficiente.`,
    );
  }

  const calendarItems = await db
    .select({
      id: contentCalendarItemsTable.id,
      mediaPlanId: contentCalendarItemsTable.mediaPlanId,
      pilar: contentCalendarItemsTable.pilar,
      temaSugerido: contentCalendarItemsTable.temaSugerido,
      tipo: contentCalendarItemsTable.tipo,
      canal: contentCalendarItemsTable.canal,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    })
    .from(contentCalendarItemsTable)
    .where(eq(contentCalendarItemsTable.tenantId, tenantId));
  const calendarByGeneration = new Map(
    calendarItems
      .filter((item) => Boolean(item.contentGenerationId))
      .map((item) => [item.contentGenerationId!, item]),
  );

  const resumo = comMetricas
    .map((p) => {
      const m = p.metricas!;
      const engajamento = (m.likes ?? 0) + (m.comments ?? 0) * 2 + (m.saved ?? 0) * 3 + (m.shares ?? 0) * 3 + (m.replies ?? 0) * 3 + (m.linkClicks ?? 0) * 4;
      const calendar = p.contentGenerationId ? calendarByGeneration.get(p.contentGenerationId) : undefined;
      const campaignName = calendar?.pilar?.split(" · ")[0]?.trim();
      const attribution = calendar
        ? ` Plano ${calendar.mediaPlanId ?? "?"}; campanha ${campaignName || "?"}; ação ${calendar.id}; canal ${calendar.canal}; formato planejado ${calendar.tipo}; tema planejado "${calendar.temaSugerido}".`
        : " Sem atribuição a item do Plano de Mídia.";
      return `Tema "${p.theme ?? "?"}" (${p.contentType}): alcance ${m.reach ?? "?"}, views ${m.views ?? m.plays ?? "?"}, curtidas ${m.likes ?? "?"}, comentários ${m.comments ?? "?"}, salvos ${m.saved ?? "?"}, compartilhamentos ${m.shares ?? "?"}, respostas ${m.replies ?? "?"}, cliques em link ${m.linkClicks ?? "?"} — score engajamento ~${engajamento}.${attribution} Legenda: ${(p.captionOuTexto ?? "").slice(0, 200)}`;
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

type QaSnapshot = {
  overallScore?: number;
  brandScore?: number;
  readabilityScore?: number;
  compositionScore?: number;
  channelFitScore?: number;
  ctaScore?: number;
  technicalScore?: number;
  approved?: boolean;
  warnings?: string[];
};

async function buildCreativeQaLearningBlock(tenantId: string): Promise<string> {
  const rows = await db
    .select({ result: contentGenerationsTable.result })
    .from(contentGenerationsTable)
    .where(eq(contentGenerationsTable.tenantId, tenantId));

  const qas = rows
    .map((row) => (row.result as { designQa?: QaSnapshot } | null)?.designQa)
    .filter((qa): qa is QaSnapshot => Boolean(qa && typeof qa.overallScore === "number"));
  if (qas.length === 0) return "";

  const average = (key: keyof QaSnapshot) => {
    const values = qas.map((qa) => qa[key]).filter((value): value is number => typeof value === "number");
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };

  const dimensions = [
    ["marca", average("brandScore")],
    ["legibilidade", average("readabilityScore")],
    ["composição", average("compositionScore")],
    ["aderência ao canal", average("channelFitScore")],
    ["CTA", average("ctaScore")],
    ["técnico", average("technicalScore")],
  ] as Array<[string, number | null]>;
  const weakest = dimensions.filter((entry): entry is [string, number] => entry[1] !== null).sort((a, b) => a[1] - b[1]).slice(0, 2);

  const warningCounts = new Map<string, number>();
  for (const qa of qas) {
    for (const warning of qa.warnings ?? []) warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1);
  }
  const recurring = [...warningCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, count]) => count >= 2);
  const approved = qas.filter((qa) => qa.approved).length;
  const overall = average("overallScore") ?? 0;

  return `\n## Aprendizado de qualidade criativa do próprio tenant (Design QA, ${qas.length} peças avaliadas)\nScore médio: ${overall}/100; aprovação: ${approved}/${qas.length}. Pontos que mais precisam melhorar: ${weakest.map(([name, score]) => `${name} (${score}/100)`).join(", ") || "sem gargalo recorrente"}.${recurring.length ? ` Alertas recorrentes: ${recurring.map(([warning, count]) => `${warning} (${count}x)`).join(" | ")}.` : ""} Nas próximas peças, preserve o que funciona e corrija esses pontos sem sacrificar a identidade da marca.\n`;
}

// Fonte única do learning prompt: une performance real do canal, mídia paga e
// qualidade criativa já medida. Nenhuma memória/tabela paralela é criada.
export async function buildOwnPerformancePromptBlock(tenantId: string): Promise<string> {
  const [insight, qaBlock, paidMediaBlock] = await Promise.all([
    getPerformanceInsights(tenantId),
    buildCreativeQaLearningBlock(tenantId),
    buildPaidMediaLearningPromptBlock(tenantId).catch((error) => {
      logger.warn({ error, tenantId }, "content-performance: paid media learning indisponível");
      return "";
    }),
  ]);

  let performanceBlock = "";
  if (insight?.aprendizados) {
    const a = insight.aprendizados;
    performanceBlock = `\n## Aprendizados dos posts publicados desta marca (dados reais de desempenho, baseado em ${insight.baseadoEmPosts} posts)\nTemas que funcionam melhor: ${a.temasQueFuncionam.join(", ")}.${a.temasQueNaoFuncionam.length ? ` Temas com engajamento mais fraco (evite ou reformule): ${a.temasQueNaoFuncionam.join(", ")}.` : ""} Formato que mais engaja: ${a.formatoQueMaisEngaja}. ${a.observacoes}\n`;
  }

  return performanceBlock + qaBlock + paidMediaBlock;
}
