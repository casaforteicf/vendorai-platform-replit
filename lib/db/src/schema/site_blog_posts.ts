import { pgTable, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { contentAutopilotArticlesTable } from "./content_autopilot";

/**
 * Blog nativo do Vendor.ai — pré-requisito de infra que faltava pro Publicador
 * do Content Autopilot conseguir publicar no site próprio do tenant (institucional
 * ou site público em *.appvendorai.com), diferente do WordPress externo.
 *
 * generated_sites (ver schema/generated_sites.ts) guarda 1 site inteiro = 1 HTML
 * único, sem conceito de post/slug individual — não serve pra artigo de blog.
 * Essa tabela é nova e independente: 1 linha = 1 post, servido via SSR nas rotas
 * públicas /sites/:siteSlug/blog e /sites/:siteSlug/blog/:postSlug.
 */
export const siteBlogPostsTable = pgTable(
  "site_blog_posts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    articleId: text("article_id").references(() => contentAutopilotArticlesTable.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    titulo: text("titulo").notNull(),
    metaDescription: text("meta_description"),
    conteudoMd: text("conteudo_md").notNull(),
    imagemCapaUrl: text("imagem_capa_url"),
    publicado: boolean("publicado").notNull().default(false),
    publicadoEm: timestamp("publicado_em"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("site_blog_posts_tenant_slug_unique").on(table.tenantId, table.slug),
    index("site_blog_posts_tenant_publicado_idx").on(table.tenantId, table.publicado),
  ],
);

export const insertSiteBlogPostSchema = createInsertSchema(siteBlogPostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateSiteBlogPostSchema = createSelectSchema(siteBlogPostsTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertSiteBlogPost = z.infer<typeof insertSiteBlogPostSchema>;
export type UpdateSiteBlogPost = z.infer<typeof updateSiteBlogPostSchema>;
export type SiteBlogPost = typeof siteBlogPostsTable.$inferSelect;
