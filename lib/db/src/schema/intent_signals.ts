import { pgTable, text, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const INTENT_SIGNAL_TYPES = [
  "google_search",
  "meta_click",
  "site_visit",
  "whatsapp_question",
] as const;

export type IntentSignalType = (typeof INTENT_SIGNAL_TYPES)[number];

export const INTENT_SIGNAL_SOURCES = [
  "google_ads",
  "instagram",
  "facebook",
  "site",
  "whatsapp",
] as const;

export type IntentSignalSource = (typeof INTENT_SIGNAL_SOURCES)[number];

/**
 * Sinais de intenção de compra do lead.
 * Gerados por webhooks externos (Google Ads, Meta, Site) ou internamente
 * quando o lead pergunta sobre um produto via WhatsApp.
 * Alimenta o score de intenção no Revenue Scout.
 */
export const intentSignalsTable = pgTable(
  "intent_signals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    signalType: text("signal_type")
      .notNull()
      .$type<IntentSignalType>(),
    source: text("source")
      .notNull()
      .$type<IntentSignalSource>(),
    productName: text("product_name"),
    searchTerm: text("search_term"),
    url: text("url"),
    value: real("value").notNull().default(50),
    confidence: real("confidence").notNull().default(0.8),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    leadIdx:     index("idx_intent_signals_lead").on(table.leadId),
    tenantIdx:   index("idx_intent_signals_tenant").on(table.tenantId),
    capturedIdx: index("idx_intent_signals_captured").on(table.capturedAt),
    typeIdx:     index("idx_intent_signals_type").on(table.signalType),
  }),
);

export type IntentSignal = typeof intentSignalsTable.$inferSelect;
export type InsertIntentSignal = typeof intentSignalsTable.$inferInsert;
