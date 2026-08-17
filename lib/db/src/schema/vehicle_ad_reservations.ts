import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { adCampaignsTable } from "./ad_campaigns";
import { veiculosEstoqueTable } from "./veiculos_estoque";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const vehicleReservationStatusEnum = pgEnum("vehicle_reservation_status", [
  "em_negociacao", "justificativa_pendente", "liberado", "vendido",
]);
export const vehicleReservationDecisionEnum = pgEnum("vehicle_reservation_decision", [
  "manter", "avancar", "perdido",
]);

export const vehicleAdReservationsTable = pgTable("vehicle_ad_reservations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  vehicleId: text("vehicle_id").notNull().references(() => veiculosEstoqueTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  sellerId: text("seller_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: vehicleReservationStatusEnum("status").notNull().default("em_negociacao"),
  reservedAt: timestamp("reserved_at").notNull().defaultNow(),
  justificationDueAt: timestamp("justification_due_at").notNull(),
  decision: vehicleReservationDecisionEnum("decision"),
  justification: text("justification"),
  decidedBy: text("decided_by").references(() => usersTable.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type VehicleAdReservation = typeof vehicleAdReservationsTable.$inferSelect;
