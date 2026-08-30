import { pgTable, text, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export interface MediaPlanCanal {
  canal: string; // ex: "Instagram", "Google Ads", "Meta Ads", "SEO orgânico"
  prioridade: "alta" | "media" | "baixa";
  motivo: string;
  tiposCampanhaSugeridos: string[];
  percentualOrcamento: number; // 0-100, soma dos canais ~100
}

export interface MediaPlanConteudo {
  diagnostico: string;
  pontosFortesAtuais: string[];
  oportunidades: string[];
  canais: MediaPlanCanal[];
  pilaresConteudo: string[];
  acoesImediatas: string[];
  concorrentesEncontrados?: Array<{ dominio: string; titulo: string; url: string }>;
  keywordsRelevantes?: Array<{ termo: string; volumeBusca: number | null }>;
}

export const mediaPlansTable = pgTable("media_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  conteudo: jsonb("conteudo").$type<MediaPlanConteudo>().notNull(),
  contextoUsado: jsonb("contexto_usado").$type<Record<string, unknown>>(),
  custoUsd: numeric("custo_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  geradoPor: text("gerado_por").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const selectMediaPlanSchema = createSelectSchema(mediaPlansTable);
export type MediaPlan = typeof mediaPlansTable.$inferSelect;
