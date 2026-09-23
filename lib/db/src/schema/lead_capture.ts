import { boolean, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type LeadCaptureMagnet = {
  id: string;
  title: string;
  promise?: string;
  questions?: string[];
  active?: boolean;
};

export type LeadCaptureFreePolicy = {
  mode: "uses" | "days" | "session" | "custom";
  limit?: number;
  durationDays?: number;
  note?: string;
};

export const tenantLeadCaptureToolsTable = pgTable(
  "tenant_lead_capture_tools",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(),
    toolLabel: text("tool_label").notNull(),
    vertical: text("vertical"),
    deliveryType: text("delivery_type").notNull().default("tool"),
    enabled: boolean("enabled").notNull().default(true),
    freePolicy: jsonb("free_policy").$type<LeadCaptureFreePolicy>().notNull().default({ mode: "uses", limit: 1 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("tenant_lead_capture_tools_tenant_tool_unique").on(t.tenantId, t.toolKey)],
);

export const leadCaptureCampaignsTable = pgTable("lead_capture_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  objective: text("objective"),
  audience: text("audience"),
  magnets: jsonb("magnets").$type<LeadCaptureMagnet[]>().notNull().default([]),
  deliveryToolKeys: jsonb("delivery_tool_keys").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leadCaptureEventsTable = pgTable("lead_capture_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").references(() => leadCaptureCampaignsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id"),
  eventType: text("event_type").notNull(),
  magnetId: text("magnet_id"),
  toolKey: text("tool_key"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TenantLeadCaptureTool = typeof tenantLeadCaptureToolsTable.$inferSelect;
export type LeadCaptureCampaign = typeof leadCaptureCampaignsTable.$inferSelect;
