import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { adCampaignsTable } from "./ad_campaigns";

export const adCampaignEventsTable = pgTable("ad_campaign_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  dedupeKey: text("dedupe_key"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  dedupe: uniqueIndex("ad_campaign_events_dedupe_idx").on(table.tenantId, table.campaignId, table.dedupeKey),
}));

export type AdCampaignEvent = typeof adCampaignEventsTable.$inferSelect;
