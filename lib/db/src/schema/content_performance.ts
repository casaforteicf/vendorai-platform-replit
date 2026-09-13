// Loop de aprendizado com métricas dos próprios posts — 3ª lacuna
// identificada contra o Dalea AI. Ver content-performance.ts (service)
// pra lógica real de coleta e análise.
import { pgTable, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { contentGenerationsTable } from "./content_generations";

export interface PostMetricas {
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  replies?: number;
  linkClicks?: number;
  plays?: number;
}

export const contentPublishedPostsTable = pgTable("content_published_posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  contentGenerationId: text("content_generation_id").references(() => contentGenerationsTable.id, { onDelete: "set null" }),
  variationIndex: integer("variation_index").notNull().default(0),
  instagramMediaId: text("instagram_media_id").notNull(),
  contentType: text("content_type").notNull(),
  theme: text("theme"),
  captionOuTexto: text("caption_ou_texto"),
  metricas: jsonb("metricas").$type<PostMetricas>(),
  ultimaColetaEm: timestamp("ultima_coleta_em"),
  ultimoErroMetricas: text("ultimo_erro_metricas"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
});

export const insertContentPublishedPostSchema = createInsertSchema(contentPublishedPostsTable, {
  ultimaColetaEm: z.coerce.date().nullable().optional(),
  publishedAt: z.coerce.date().optional(),
}).omit({ id: true, publishedAt: true });

export type ContentPublishedPost = typeof contentPublishedPostsTable.$inferSelect;
export type NewContentPublishedPost = typeof contentPublishedPostsTable.$inferInsert;

export interface PerformanceAprendizados {
  temasQueFuncionam: string[];
  temasQueNaoFuncionam: string[];
  formatoQueMaisEngaja: string;
  observacoes: string;
}

export const contentPerformanceInsightsTable = pgTable("content_performance_insights", {
  tenantId: text("tenant_id").primaryKey().references(() => tenantsTable.id, { onDelete: "cascade" }),
  aprendizados: jsonb("aprendizados").$type<PerformanceAprendizados>(),
  baseadoEmPosts: integer("baseado_em_posts").notNull().default(0),
  atualizadoEm: timestamp("atualizado_em"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ContentPerformanceInsight = typeof contentPerformanceInsightsTable.$inferSelect;

export const metaGrowthDailySnapshotsTable = pgTable("meta_growth_daily_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  snapshotDate: text("snapshot_date").notNull(),
  followers: integer("followers"),
  reach30d: integer("reach_30d"),
  profileVisits30d: integer("profile_visits_30d"),
  engagedAccounts30d: integer("engaged_accounts_30d"),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
}, (table) => ({
  tenantDayUnique: uniqueIndex("meta_growth_daily_snapshots_tenant_day_uidx").on(table.tenantId, table.snapshotDate),
}));

export type MetaGrowthDailySnapshot = typeof metaGrowthDailySnapshotsTable.$inferSelect;
