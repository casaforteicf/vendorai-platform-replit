import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const searchConsoleConnectionsTable = pgTable("search_console_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  // URL da propriedade no Search Console (formato "https://slug.appvendorai.com/"
  // ou o domínio próprio do tenant, resolvido no momento da conexão).
  siteUrl: text("site_url"),
  // Credencial durável (access_type=offline + prompt=consent), igual ao
  // padrão já usado no Google Ads.
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  // true depois que a Site Verification API confirma a propriedade via meta
  // tag injetada no HTML do site (mesmo mecanismo de injectTenantMarketingTags).
  verified: boolean("verified").notNull().default(false),
  // Token de verificação retornado pela Site Verification API — precisa
  // ficar salvo pra reinjetar na meta tag caso o site seja regenerado antes
  // da verificação ser concluída.
  verificationMetaToken: text("verification_meta_token"),
  sitemapSubmittedAt: timestamp("sitemap_submitted_at"),
  // "pending_verification" | "active" | "disconnected"
  status: text("status").notNull().default("pending_verification"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
});

export const insertSearchConsoleConnectionSchema = createInsertSchema(searchConsoleConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
  sitemapSubmittedAt: z.coerce.date().optional(),
}).omit({ id: true });

export const updateSearchConsoleConnectionSchema = createSelectSchema(searchConsoleConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
  sitemapSubmittedAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertSearchConsoleConnection = z.infer<typeof insertSearchConsoleConnectionSchema>;
export type UpdateSearchConsoleConnection = z.infer<typeof updateSearchConsoleConnectionSchema>;
export type SearchConsoleConnection = typeof searchConsoleConnectionsTable.$inferSelect;
