import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const prospectCampaignsTable = pgTable("prospect_campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),

  status: text("status"),
  day1SentAt: timestamp("day1_sent_at"),
  day3SentAt: timestamp("day3_sent_at"),
  day7SentAt: timestamp("day7_sent_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectCampaignSchema = createInsertSchema(prospectCampaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProspectCampaignSchema = createSelectSchema(prospectCampaignsTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type ProspectCampaign = typeof prospectCampaignsTable.$inferSelect;
export type InsertProspectCampaign = z.infer<typeof insertProspectCampaignSchema>;
export type UpdateProspectCampaign = z.infer<typeof updateProspectCampaignSchema>;
