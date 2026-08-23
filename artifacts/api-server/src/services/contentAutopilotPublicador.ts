/**
 * Publicador — quarto e último agente do Content Autopilot (ver briefing
 * /areas/content-autopilot). Esse arquivo cobre só o canal "site_proprio"
 * (blog nativo do Vendor.ai, ver schema/site_blog_posts.ts) — WordPress
 * externo fica pra depois.
 *
 * Sempre cria o post com publicado=false (rascunho) — nunca publica sozinho.
 * A revisão humana (PATCH .../publish) é quem decide colocar no ar.
 */
import { db, siteBlogPostsTable, contentAutopilotArticlesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export interface PublishNativeResult {
  postId: string;
  slug: string;
}

/** Cria (ou atualiza, se já existir post pra esse artigo) o rascunho de blog no site próprio. */
export async function publishToNativeSite(tenantId: string, articleId: string): Promise<PublishNativeResult> {
  const [article] = await db
    .select()
    .from(contentAutopilotArticlesTable)
    .where(and(eq(contentAutopilotArticlesTable.id, articleId), eq(contentAutopilotArticlesTable.tenantId, tenantId)));
  if (!article) throw new Error("Artigo não encontrado pra esse tenant");
  if (!article.titulo || !article.conteudoMd) {
    throw new Error("Artigo sem título/conteúdo — rode o Criador (e idealmente o Otimizador) primeiro");
  }

  const [existing] = await db
    .select({ id: siteBlogPostsTable.id })
    .from(siteBlogPostsTable)
    .where(eq(siteBlogPostsTable.articleId, articleId));

  const baseSlug = article.slug || slugify(article.titulo);
  const imagemCapaUrl = article.imagens?.[0]?.url ?? null;

  if (existing) {
    await db
      .update(siteBlogPostsTable)
      .set({
        titulo: article.titulo,
        metaDescription: article.metaDescription,
        conteudoMd: article.conteudoMd,
        imagemCapaUrl,
        updatedAt: new Date(),
      })
      .where(eq(siteBlogPostsTable.id, existing.id));
    logger.info({ tenantId, articleId, postId: existing.id }, "content-autopilot: Publicador (site_proprio) — rascunho atualizado");
    return { postId: existing.id, slug: baseSlug };
  }

  // Garante slug único por tenant — se colidir (raro, mesmo título gerado 2x),
  // acrescenta sufixo curto em vez de falhar.
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const [clash] = await db
      .select({ id: siteBlogPostsTable.id })
      .from(siteBlogPostsTable)
      .where(and(eq(siteBlogPostsTable.tenantId, tenantId), eq(siteBlogPostsTable.slug, slug)));
    if (!clash) break;
    attempt++;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const [created] = await db
    .insert(siteBlogPostsTable)
    .values({
      tenantId,
      articleId,
      slug,
      titulo: article.titulo,
      metaDescription: article.metaDescription,
      conteudoMd: article.conteudoMd,
      imagemCapaUrl,
      publicado: false,
    })
    .returning({ id: siteBlogPostsTable.id });

  logger.info({ tenantId, articleId, postId: created.id, slug }, "content-autopilot: Publicador (site_proprio) — rascunho criado");
  return { postId: created.id, slug };
}
