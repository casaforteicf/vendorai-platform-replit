import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const leadProposalsTable = pgTable("lead_proposals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  htmlContent: text("html_content").notNull(),
  jsonContent: text("json_content").notNull(),
  status: text("status").notNull().default("ready"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeadProposalSchema = createInsertSchema(leadProposalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeadProposalSchema = createSelectSchema(leadProposalsTable)
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertLeadProposal = z.infer<typeof insertLeadProposalSchema>;
export type UpdateLeadProposal = z.infer<typeof updateLeadProposalSchema>;
export type LeadProposal = typeof leadProposalsTable.$inferSelect;
