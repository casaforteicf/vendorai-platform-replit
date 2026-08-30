import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { adCampaignsTable } from "./ad_campaigns";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

// Mesmo espírito de vehicle_ad_reservations.ts (que continua existindo e
// funcionando exatamente como estava, sem nenhuma mudança) -- mas
// genérico pra qualquer itemTipo de campanha em "Modo: Só este item"
// (imóvel, produto, landing_page, livre). Não usa enum fixo pro tipo de
// item nem pro status/decisão -- texto livre validado na camada de
// serviço, pra não precisar de migration toda vez que um itemTipo novo
// entrar no sistema.
export type ItemReservationStatus = "em_negociacao" | "justificativa_pendente" | "liberado" | "vendido";
export type ItemReservationDecision = "manter" | "avancar" | "perdido";

export const itemAdReservationsTable = pgTable("item_ad_reservations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  itemTipo: text("item_tipo").notNull(),
  itemId: text("item_id").notNull(),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  sellerId: text("seller_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: text("status").$type<ItemReservationStatus>().notNull().default("em_negociacao"),
  reservedAt: timestamp("reserved_at").notNull().defaultNow(),
  justificationDueAt: timestamp("justification_due_at").notNull(),
  decision: text("decision").$type<ItemReservationDecision>(),
  justification: text("justification"),
  decidedBy: text("decided_by").references(() => usersTable.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ItemAdReservation = typeof itemAdReservationsTable.$inferSelect;
