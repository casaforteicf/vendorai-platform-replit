import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";
import { leadsTable } from "./leads";

export const campaignSentLogsTable = pgTable(
  "campaign_sent_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    variant: text("variant").$type<"A" | "B" | "main">().notNull().default("main"),
    wamid: text("wamid"),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
    convertedAt: timestamp("converted_at"),
  },
  (t) => [
    index("campaign_sent_log_campaign_idx").on(t.campaignId),
    index("campaign_sent_log_lead_idx").on(t.leadId),
    index("campaign_sent_log_wamid_idx").on(t.wamid),
  ]
);

export const insertCampaignSentLogSchema = createInsertSchema(
  campaignSentLogsTable
).omit({ id: true });

export const selectCampaignSentLogSchema = createSelectSchema(
  campaignSentLogsTable
);

export type InsertCampaignSentLog = z.infer<typeof insertCampaignSentLogSchema>;
export type CampaignSentLog = typeof campaignSentLogsTable.$inferSelect;
