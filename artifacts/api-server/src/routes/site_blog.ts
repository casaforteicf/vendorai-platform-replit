import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, siteBlogPostsTable, generatedSitesTable, tenantsTable } from "@workspace/db";
import { marked } from "marked";
import { publishToNativeSite } from "../services/contentAutopilotPublicador.js";

/**
 * Blog nativo — ver justificativa completa em schema/site_blog_posts.ts.
 * Resolução de siteSlug → tenantId reaproveita exatamente o mesmo padrão de
 * /public/:tenantSlug/site-html em site_generator.ts (siteSlug de um site
 * gerado tem prioridade; fallback pro slug/subdomainSlug do próprio tenant).
 */
async function resolveTenantIdBySiteSlug(siteSlug: string): Promise<string | null> {
  const [siteBySlug] = await db
    .select({ tenantId: generatedSitesTable.tenantId })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.siteSlug, siteSlug))
    .limit(1);
  if (siteBySlug) return siteBySlug.tenantId;

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(or(eq(tenantsTable.slug, siteSlug), eq(tenantsTable.subdomainSlug, siteSlug)));
  return tenant?.id ?? null;
}

function notFoundPage(msg: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${msg}</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;}div{text-align:center;}</style></head><body><div><p style="font-size:3rem">🌐</p><h1 style="color:#1e293b">${msg}</h1></div></body></html>`;
}

function renderPostPage(post: { titulo: string; metaDescription: string | null; conteudoMd: string; imagemCapaUrl: string | null; publicadoEm: Date | null }): string {
  const bodyHtml = marked.parse(post.conteudoMd, { async: false }) as string;
  const meta = post.metaDescription ? `<meta name="description" content="${post.metaDescription.replace(/"/g, "&quot;")}">` : "";
  const ogImage = post.imagemCapaUrl ? `<meta property="og:image" content="${post.imagemCapaUrl}">` : "";
  const cover = post.imagemCapaUrl ? `<img src="${post.imagemCapaUrl}" alt="${post.titulo.replace(/"/g, "&quot;")}" style="width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:2rem;">` : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${post.titulo}</title>${meta}
<meta property="og:title" content="${post.titulo.replace(/"/g, "&quot;")}">${ogImage}
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;padding:2rem 1.5rem 4rem;line-height:1.7;color:#1e293b}h1{font-size:2rem;line-height:1.2}h2{font-size:1.4rem;margin-top:2.5rem}p{color:#334155}a{color:#6D4FE8}img{max-width:100%;height:auto;border-radius:12px;margin:1.5rem 0}</style>
</head><body>${cover}<h1>${post.titulo}</h1>${bodyHtml}</body></html>`;
}

// ── Rotas públicas (SSR, sem autenticação) ───────────────────────────────────
export const siteBlogPublicRouter: IRouter = Router();

siteBlogPublicRouter.get("/sites/:siteSlug/blog", async (req, res) => {
  const tenantId = await resolveTenantIdBySiteSlug(req.params.siteSlug as string);
  if (!tenantId) {
    res.status(404).send(notFoundPage("Site não encontrado"));
    return;
  }

  const posts = await db
    .select({ slug: siteBlogPostsTable.slug, titulo: siteBlogPostsTable.titulo, imagemCapaUrl: siteBlogPostsTable.imagemCapaUrl, publicadoEm: siteBlogPostsTable.publicadoEm })
    .from(siteBlogPostsTable)
    .where(and(eq(siteBlogPostsTable.tenantId, tenantId), eq(siteBlogPostsTable.publicado, true)))
    .orderBy(desc(siteBlogPostsTable.publicadoEm));

  const items = posts
    .map(
      (p) =>
        `<li style="margin-bottom:1.5rem"><a href="/sites/${req.params.siteSlug}/blog/${p.slug}" style="text-decoration:none;color:#1e293b;font-size:1.2rem;font-weight:600">${p.titulo}</a></li>`,
    )
    .join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Blog</title><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;padding:2rem 1.5rem}</style></head><body><h1>Blog</h1><ul style="list-style:none;padding:0">${items || "<p>Nenhum post publicado ainda.</p>"}</ul></body></html>`,
  );
});

siteBlogPublicRouter.get("/sites/:siteSlug/blog/:postSlug", async (req, res) => {
  const tenantId = await resolveTenantIdBySiteSlug(req.params.siteSlug as string);
  if (!tenantId) {
    res.status(404).send(notFoundPage("Site não encontrado"));
    return;
  }

  const [post] = await db
    .select()
    .from(siteBlogPostsTable)
    .where(and(eq(siteBlogPostsTable.tenantId, tenantId), eq(siteBlogPostsTable.slug, req.params.postSlug as string)));

  if (!post || !post.publicado) {
    res.status(404).send(notFoundPage("Post não encontrado"));
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.send(renderPostPage(post));
});

// ── Rotas protegidas (autenticadas, tenant-scoped) ───────────────────────────
export const siteBlogAdminRouter: IRouter = Router();

function checkAccess(req: any, res: any, tenantId: string): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// POST /tenants/:tenantId/content-autopilot/articles/:id/publish-native
// Aciona o Publicador (canal site próprio): cria/atualiza o rascunho de blog.
// Nunca publica sozinho — publicado fica false até PATCH .../publish explícito.
siteBlogAdminRouter.post("/tenants/:tenantId/content-autopilot/articles/:id/publish-native", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  try {
    const result = await publishToNativeSite(tenantId, req.params.id as string);
    res.status(201).json(result);
  } catch (err) {
    req.log?.error({ err, tenantId, articleId: req.params.id }, "content-autopilot/publish-native: falhou");
    res.status(502).json({ error: err instanceof Error ? err.message : "Falha ao publicar no site próprio" });
  }
});

// GET /tenants/:tenantId/content-autopilot/site-blog-posts
siteBlogAdminRouter.get("/tenants/:tenantId/content-autopilot/site-blog-posts", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const posts = await db
    .select()
    .from(siteBlogPostsTable)
    .where(eq(siteBlogPostsTable.tenantId, tenantId))
    .orderBy(desc(siteBlogPostsTable.createdAt));
  res.json({ posts });
});

// PATCH /tenants/:tenantId/content-autopilot/site-blog-posts/:id/publish
// Ação de revisão humana — a única forma do rascunho virar post público de verdade.
siteBlogAdminRouter.patch("/tenants/:tenantId/content-autopilot/site-blog-posts/:id/publish", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const [updated] = await db
    .update(siteBlogPostsTable)
    .set({ publicado: true, publicadoEm: new Date(), updatedAt: new Date() })
    .where(and(eq(siteBlogPostsTable.id, req.params.id as string), eq(siteBlogPostsTable.tenantId, tenantId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }
  res.json({ post: updated });
});

// PATCH /tenants/:tenantId/content-autopilot/site-blog-posts/:id/unpublish
siteBlogAdminRouter.patch("/tenants/:tenantId/content-autopilot/site-blog-posts/:id/unpublish", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!checkAccess(req, res, tenantId)) return;

  const [updated] = await db
    .update(siteBlogPostsTable)
    .set({ publicado: false, updatedAt: new Date() })
    .where(and(eq(siteBlogPostsTable.id, req.params.id as string), eq(siteBlogPostsTable.tenantId, tenantId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }
  res.json({ post: updated });
});
