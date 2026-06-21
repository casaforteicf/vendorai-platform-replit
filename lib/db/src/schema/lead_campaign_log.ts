import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const leadCampaignLogTable = pgTable("lead_campaign_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  campaignType: text("campaign_type").notNull(), // birthday_lead, birthday_family, deal_anniversary, commercial_date
  campaignKey: text("campaign_key").notNull(), // e.g., "2026-05-12-mothers-day"
  year: text("year").notNull(), // "2026"
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  status: text("status").notNull().default("pending"), // pending, sent, failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeadCampaignLogSchema = createInsertSchema(
  leadCampaignLogTable,
  {
    sentAt: z.coerce.date().optional(),
  }
).omit({ id: true, createdAt: true });

export const updateLeadCampaignLogSchema = createSelectSchema(
  leadCampaignLogTable,
  {
    sentAt: z.coerce.date().optional(),
  }
)
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true })
  .partial();

export type InsertLeadCampaignLog = z.infer<typeof insertLeadCampaignLogSchema>;
export type UpdateLeadCampaignLog = z.infer<typeof updateLeadCampaignLogSchema>;
