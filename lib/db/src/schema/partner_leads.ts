import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { tenantsTable } from "./tenants";

export const partnerLeadsTable = pgTable(
  "partner_leads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    partnerId: text("partner_id")
      .references(() => partnersTable.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .references(() => tenantsTable.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    telefone: text("telefone"),
    email: text("email"),
    empresa: text("empresa"),
    objetivo: text("objetivo"),
    status: text("status").notNull().default("novo"),
    source: text("source").notNull().default("parceiro"),
    // ── Prospector Alpha columns ──────────────────────────────────────────
    prospectorJobId: text("prospector_job_id"),
    googlePlaceId: text("google_place_id"),
    score: integer("score").default(0),
    // ─────────────────────────────────────────────────────────────────────
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("partner_leads_partner_idx").on(table.partnerId),
    index("partner_leads_tenant_idx").on(table.tenantId),
    index("partner_leads_job_idx").on(table.prospectorJobId),
  ]
);

export const insertPartnerLeadSchema = createInsertSchema(partnerLeadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePartnerLeadSchema = createSelectSchema(partnerLeadsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertPartnerLead = z.infer<typeof insertPartnerLeadSchema>;
export type PartnerLead = typeof partnerLeadsTable.$inferSelect;
