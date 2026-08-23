/**
 * Otimizador — terceiro dos 4 agentes do Content Autopilot (ver briefing
 * /areas/content-autopilot). Duas responsabilidades, nenhuma delas chama
 * o Claude (custo zero de LLM aqui, só embedding):
 *  1. Score de SEO determinístico (título, meta, densidade de keyword,
 *     headers, tamanho, legibilidade) — checklist auditável, sem "caixa preta"
 *  2. Linkagem interna: embedding do artigo (OpenAI, via generateEmbedding
 *     já usado no Prospector — cost-tracked pelo ai-gateway/quota do tenant)
 *     comparado por similaridade (pgvector <=>) com outros artigos do mesmo
 *     tenant já otimizados/publicados
 *
 * Sempre termina em status "pronto_revisao" — é o último passo antes do
 * Publicador (ainda não construído), nunca publica nada sozinho.
 */
import { db, contentAutopilotArticlesTable } from "@workspace/db";
import { eq, and, ne, sql, inArray } from "drizzle-orm";
import { generateEmbedding } from "../lib/ai-gateway.js";
import { logger } from "../lib/logger.js";
import type { ContentAutopilotArticle, ContentAutopilotSeoChecklist, ContentAutopilotLink } from "@workspace/db";

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countHeaders(md: string): number {
  return (md.match(/^##\s+/gm) ?? []).length;
}

/** Densidade de keyword: % de ocorrências (case-insensitive, palavra a palavra) sobre o total de palavras. */
function keywordDensity(md: string, keyword: string): number {
  const words = countWords(md);
  if (words === 0) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = md.match(new RegExp(escaped, "gi")) ?? [];
  return (matches.length / words) * 100;
}

/** Legibilidade simples: média de palavras por frase. Frases muito longas prejudicam leitura em blog. */
function avgWordsPerSentence(md: string): number {
  const plain = md.replace(/[#*_`>]/g, "");
  const sentences = plain.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + countWords(s), 0);
  return totalWords / sentences.length;
}

export interface SeoScoreResult {
  score: number;
  checklist: ContentAutopilotSeoChecklist;
}

export function computeSeoScore(article: { titulo: string; metaDescription: string; conteudoMd: string; keywordTermo: string }): SeoScoreResult {
  const { titulo, metaDescription, conteudoMd, keywordTermo } = article;

  const checklist: ContentAutopilotSeoChecklist = {
    tituloOk: titulo.length >= 30 && titulo.length <= 65 && titulo.toLowerCase().includes(keywordTermo.toLowerCase().split(" ")[0]),
    metaDescriptionOk: metaDescription.length >= 120 && metaDescription.length <= 165,
    densidadeKeywordOk: (() => {
      const d = keywordDensity(conteudoMd, keywordTermo);
      return d >= 0.3 && d <= 3.5;
    })(),
    headersOk: countHeaders(conteudoMd) >= 3,
    tamanhoMinimoOk: countWords(conteudoMd) >= 600,
    legibilidadeOk: avgWordsPerSentence(conteudoMd) <= 28,
  };

  const total = Object.values(checklist).length;
  const passed = Object.values(checklist).filter(Boolean).length;
  const score = Math.round((passed / total) * 100);

  return { score, checklist };
}

/** Busca até `limit` artigos do mesmo tenant mais similares ao embedding dado, excluindo o próprio artigo. */
async function findSimilarArticles(
  tenantId: string,
  articleId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<Array<{ id: string; titulo: string; slug: string }>> {
  const vec = toVectorLiteral(queryEmbedding);
  const rows = await db
    .select({ id: contentAutopilotArticlesTable.id, titulo: contentAutopilotArticlesTable.titulo, slug: contentAutopilotArticlesTable.slug })
    .from(contentAutopilotArticlesTable)
    .where(
      and(
        eq(contentAutopilotArticlesTable.tenantId, tenantId),
        ne(contentAutopilotArticlesTable.id, articleId),
        inArray(contentAutopilotArticlesTable.status, ["otimizando", "pronto_revisao", "publicado"]),
        sql`${contentAutopilotArticlesTable.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${contentAutopilotArticlesTable.embedding} <=> ${vec}::vector`)
    .limit(limit);
  return rows.filter((r): r is { id: string; titulo: string; slug: string } => !!r.titulo && !!r.slug);
}

export interface OptimizeArticleResult {
  seoScore: number;
  seoChecklist: ContentAutopilotSeoChecklist;
  linksInternos: ContentAutopilotLink[];
}

/** Orquestra o Otimizador completo: score + embedding + linkagem interna. Grava status 'pronto_revisao'. */
export async function optimizeArticle(tenantId: string, articleId: string, keywordTermo: string): Promise<OptimizeArticleResult> {
  const [article] = await db
    .select()
    .from(contentAutopilotArticlesTable)
    .where(and(eq(contentAutopilotArticlesTable.id, articleId), eq(contentAutopilotArticlesTable.tenantId, tenantId)));
  if (!article) throw new Error("Artigo não encontrado pra esse tenant");
  if (!article.titulo || !article.metaDescription || !article.conteudoMd) {
    throw new Error("Artigo ainda não tem título/meta/conteúdo — rode o Criador primeiro");
  }

  const { score, checklist } = computeSeoScore({
    titulo: article.titulo,
    metaDescription: article.metaDescription,
    conteudoMd: article.conteudoMd,
    keywordTermo,
  });

  let linksInternos: ContentAutopilotLink[] = [];
  try {
    const { embedding } = await generateEmbedding(tenantId, `${article.titulo}\n\n${article.conteudoMd}`, { log: logger });
    if (embedding.length > 0) {
      const similares = await findSimilarArticles(tenantId, articleId, embedding, 3);
      linksInternos = similares.map((s) => ({ url: `/blog/${s.slug}`, anchorText: s.titulo }));

      await db
        .update(contentAutopilotArticlesTable)
        .set({ embedding } as any)
        .where(eq(contentAutopilotArticlesTable.id, articleId));
    }
  } catch (err) {
    // Linkagem interna é um bônus, não trava a otimização se o embedding falhar
    // (ex: quota de IA do tenant estourada) — o artigo ainda sai com score de SEO.
    logger.warn({ err, tenantId, articleId }, "content-autopilot: embedding/linkagem interna falhou, seguindo sem links");
  }

  await db
    .update(contentAutopilotArticlesTable)
    .set({ seoScore: score, seoChecklist: checklist, linksInternos, status: "pronto_revisao" } as any)
    .where(eq(contentAutopilotArticlesTable.id, articleId));

  return { seoScore: score, seoChecklist: checklist, linksInternos };
}
