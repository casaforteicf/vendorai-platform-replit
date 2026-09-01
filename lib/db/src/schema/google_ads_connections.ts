import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const googleAdsConnectionsTable = pgTable("google_ads_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  // Conta Google Ads escolhida (formato "1234567890", sem hífens). Fica nula
  // entre o callback OAuth e a etapa de seleção de conta, quando o usuário
  // tem acesso a mais de uma conta acessível pelo refresh token.
  customerId: text("customer_id"),
  descriptiveName: text("descriptive_name"),
  currencyCode: text("currency_code"),
  timeZone: text("time_zone"),
  // Destinos da Data Manager API. Cada ID é uma Conversion Action do Google
  // Ads do tipo UPLOAD_CLICKS. Mantemos IDs separados porque lead, trial e
  // venda têm objetivos/valores diferentes e precisam ser reportados de forma
  // independente na conta de mídia.
  dataManagerLeadConversionActionId: text("data_manager_lead_conversion_action_id"),
  dataManagerTrialConversionActionId: text("data_manager_trial_conversion_action_id"),
  dataManagerSaleConversionActionId: text("data_manager_sale_conversion_action_id"),
  dataManagerConfiguredAt: timestamp("data_manager_configured_at"),
  // Credencial durável do fluxo OAuth (access_type=offline + prompt=consent).
  // É o que permite renovar o access token sem novo consentimento do usuário.
  refreshToken: text("refresh_token"),
  // Access token de curta duração, cacheado para evitar um refresh por request.
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  // "pending_account_selection" | "active" | "disconnected"
  status: text("status").notNull().default("pending_account_selection"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
});

export const insertGoogleAdsConnectionSchema = createInsertSchema(googleAdsConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  dataManagerConfiguredAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
}).omit({ id: true });

export const updateGoogleAdsConnectionSchema = createSelectSchema(googleAdsConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  dataManagerConfiguredAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertGoogleAdsConnection = z.infer<typeof insertGoogleAdsConnectionSchema>;
export type UpdateGoogleAdsConnection = z.infer<typeof updateGoogleAdsConnectionSchema>;
export type GoogleAdsConnection = typeof googleAdsConnectionsTable.$inferSelect;
