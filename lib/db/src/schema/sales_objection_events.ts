import {
  pgTable,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { conversationsTable } from "./conversations";
import { prospectingObjectionsTable } from "./prospecting_objections";

export type SalesObjectionOutcome =
  | "pending"
  | "advanced"
  | "won"
  | "lost"
  | "no_change"
  | "unknown";

export const salesObjectionEventsTable = pgTable(
  "sales_objection_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    objectionId: text("objection_id").references(() => prospectingObjectionsTable.id, {
      onDelete: "set null",
    }),
    objectionMessageId: text("objection_message_id"),
    responseMessageId: text("response_message_id"),
    rawObjection: text("raw_objection").notNull(),
    normalizedObjection: text("normalized_objection").notNull(),
    category: text("category").notNull().default("outro"),
    segmento: text("segmento").notNull().default("geral"),
    responseText: text("response_text"),
    responderType: text("responder_type"),
    agentName: text("agent_name"),
    triggerUsed: text("trigger_used"),
    dealStage: text("deal_stage"),
    outcome: text("outcome")
      .$type<SalesObjectionOutcome>()
      .notNull()
      .default("pending"),
    brokeObjection: boolean("broke_objection").notNull().default(false),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sales_objection_events_tenant_message_uidx").on(
      table.tenantId,
      table.conversationId,
      table.objectionMessageId,
    ),
    index("sales_objection_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("sales_objection_events_tenant_category_idx").on(table.tenantId, table.category),
    index("sales_objection_events_tenant_objection_idx").on(table.tenantId, table.objectionId),
    index("sales_objection_events_lead_idx").on(table.leadId, table.createdAt),
  ],
);

export type SalesObjectionEvent = typeof salesObjectionEventsTable.$inferSelect;
