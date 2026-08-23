// Conexão OAuth com a API de Marketing da Meta (Facebook Ads), pro módulo
// de Anúncios publicar campanhas de verdade em plataforma='meta'. Mesmo
// desenho de lifecycle do google_ads_connections.ts (pending_account_
// selection -> active -> disconnected).
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const metaAdsConnectionsTable = pgTable("meta_ads_connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  // "act_1234567890" — com o prefixo act_, exigido pela Marketing API em
  // toda chamada. Nula entre o callback OAuth e a seleção de conta.
  adAccountId: text("ad_account_id"),
  adAccountName: text("ad_account_name"),
  businessId: text("business_id"),
  currency: text("currency"),
  // Token de usuário de longa duração (~60 dias). Sem refresh_token
  // separado como o Google — renova trocando o próprio token ainda
  // válido por um novo antes de expirar (fb_exchange_token).
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  status: text("status").notNull().default("pending_account_selection"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
});

export const insertMetaAdsConnectionSchema = createInsertSchema(metaAdsConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
}).omit({ id: true });

export const updateMetaAdsConnectionSchema = createSelectSchema(metaAdsConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertMetaAdsConnection = z.infer<typeof insertMetaAdsConnectionSchema>;
export type UpdateMetaAdsConnection = z.infer<typeof updateMetaAdsConnectionSchema>;
export type MetaAdsConnection = typeof metaAdsConnectionsTable.$inferSelect;
