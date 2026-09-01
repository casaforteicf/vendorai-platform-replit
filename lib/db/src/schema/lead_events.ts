import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";
import { tenantsTable } from "./tenants";
import { adCampaignsTable } from "./ad_campaigns";

export const leadEventsTable = pgTable("lead_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  descricao: text("descricao").notNull(),
  scoreBoost: integer("score_boost").default(0),
  expiresAt: timestamp("expires_at"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadEvent = typeof leadEventsTable.$inferSelect;

/**
 * Eventos first-party de navegação anteriores à identificação do visitante.
 * A sessão nasce anônima e pode receber leadId posteriormente, no submit de um
 * formulário. Não armazena IP, user-agent bruto, e-mail ou telefone.
 */
export const webBehaviorEventsTable = pgTable("web_behavior_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  anonymousSessionId: text("anonymous_session_id").notNull(),
  tenantId: text("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  adCampaignId: text("ad_campaign_id").references(() => adCampaignsTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  pageUrl: text("page_url"),
  path: text("path"),
  referrer: text("referrer"),
  landingPageSlug: text("landing_page_slug"),
  engagedMs: integer("engaged_ms"),
  scrollDepth: integer("scroll_depth"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index("web_behavior_events_session_idx").on(table.anonymousSessionId, table.createdAt),
  leadIdx: index("web_behavior_events_lead_idx").on(table.leadId, table.createdAt),
  campaignIdx: index("web_behavior_events_campaign_idx").on(table.adCampaignId, table.createdAt),
  eventIdx: index("web_behavior_events_type_idx").on(table.eventType, table.createdAt),
}));

export type WebBehaviorEvent = typeof webBehaviorEventsTable.$inferSelect;
