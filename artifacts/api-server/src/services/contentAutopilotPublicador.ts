/**
 * Publicador — quarto e último agente do Content Autopilot.
 *
 * O modo de publicação é decidido pelo orquestrador:
 * - Semiautomático: cria/atualiza rascunho para revisão humana.
 * - Automático: publica somente depois de a keyword ter sido aprovada e o
 *   artigo ter passado por geração + otimização.
 *
 * Segurança de destino: este serviço é exclusivamente o publicador nativo do
 * VendorAI. Antes de criar rascunho ou marcar um artigo como publicado, ele
 * confirma que o site principal resolvido do tenant é realmente hospedado pelo
 * VendorAI. Assim o job automático não pode simular publicação em CMS externo.
 */
import { db, siteBlogPostsTable, contentAutopilotArticlesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { resolveWebsiteConnection } from "./websiteConnector.js";

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
  published: boolean;
}

export interface PublishNativeOptions {
  publish?: boolean;
}

async function assertNativePublicationTarget(tenantId: string) {
  const connection = await resolveWebsiteConnection(tenantId);
  if (connection.canPublish) return connection;

  if (connection.status === "not_configured") {
    throw new Error("Site principal do cliente não configurado. O publicador nativo foi bloqueado.");
  }

  throw new Error(
    `O site principal ${connection.hostname ?? "externo"} exige conexão real com o CMS. O publicador nativo do VendorAI não pode marcar esse conteúdo como publicado.`,
  );
}

/** Cria ou atualiza o post nativo, respeitando o nível de automação autorizado. */
export async function publishToNativeSite(
  tenantId: string,
  articleId: string,
  options: PublishNativeOptions = {},
): Promise<PublishNativeResult> {
  await assertNativePublicationTarget(tenantId);

  const publish = options.publish === true;
  const now = new Date();

  const [article] = await db
    .select()
    .from(contentAutopilotArticlesTable)
    .where(and(eq(contentAutopilotArticlesTable.id, articleId), eq(contentAutopilotArticlesTable.tenantId, tenantId)));
  if (!article) throw new Error("Artigo não encontrado pra esse tenant");
  if (!article.titulo || !article.conteudoMd) {
    throw new Error("Artigo sem título/conteúdo — rode o Criador e o Otimizador primeiro");
  }

  const [existing] = await db
    .select({ id: siteBlogPostsTable.id, slug: siteBlogPostsTable.slug })
    .from(siteBlogPostsTable)
    .where(and(eq(siteBlogPostsTable.articleId, articleId), eq(siteBlogPostsTable.tenantId, tenantId)));

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
        publicado: publish,
        publicadoEm: publish ? now : null,
        updatedAt: now,
      })
      .where(and(eq(siteBlogPostsTable.id, existing.id), eq(siteBlogPostsTable.tenantId, tenantId)));

    await db
      .update(contentAutopilotArticlesTable)
      .set({
        status: publish ? "publicado" : "pronto_revisao",
        publicadoEm: publish ? now : null,
      })
      .where(and(eq(contentAutopilotArticlesTable.id, articleId), eq(contentAutopilotArticlesTable.tenantId, tenantId)));

    logger.info(
      { tenantId, articleId, postId: existing.id, published: publish },
      publish
        ? "content-autopilot: Publicador — post atualizado e publicado automaticamente"
        : "content-autopilot: Publicador — rascunho atualizado para revisão",
    );
    return { postId: existing.id, slug: existing.slug || baseSlug, published: publish };
  }

  // Garante slug único por tenant.
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
      publicado: publish,
      publicadoEm: publish ? now : null,
    })
    .returning({ id: siteBlogPostsTable.id });

  await db
    .update(contentAutopilotArticlesTable)
    .set({
      status: publish ? "publicado" : "pronto_revisao",
      publicadoEm: publish ? now : null,
    })
    .where(and(eq(contentAutopilotArticlesTable.id, articleId), eq(contentAutopilotArticlesTable.tenantId, tenantId)));

  logger.info(
    { tenantId, articleId, postId: created.id, slug, published: publish },
    publish
      ? "content-autopilot: Publicador — post publicado automaticamente"
      : "content-autopilot: Publicador — rascunho criado para revisão",
  );
  return { postId: created.id, slug, published: publish };
}
