import { pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const prospectApprovalsTable = pgTable("prospect_approvals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),

  messageType: text("message_type"),
  generatedText: text("generated_text"),
  approvedText: text("approved_text"),
  action: text("action"),
  embedding: vector("embedding", { dimensions: 1536 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProspectApprovalSchema = createInsertSchema(prospectApprovalsTable).omit({
  id: true,
  createdAt: true,
});

export const updateProspectApprovalSchema = createSelectSchema(prospectApprovalsTable)
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type ProspectApproval = typeof prospectApprovalsTable.$inferSelect;
export type InsertProspectApproval = z.infer<typeof insertProspectApprovalSchema>;
export type UpdateProspectApproval = z.infer<typeof updateProspectApprovalSchema>;
