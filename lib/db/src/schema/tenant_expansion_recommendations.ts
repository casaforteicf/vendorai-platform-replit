import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const TENANT_EXPANSION_STATUSES = [
  "identified",
  "presented",
  "accepted",
  "rejected",
  "contracted",
  "expired",
] as const;

export type TenantExpansionStatus = (typeof TENANT_EXPANSION_STATUSES)[number];

export const tenantExpansionRecommendationsTable = pgTable(
  "tenant_expansion_recommendations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    commercialKey: text("commercial_key").notNull(),
    kind: text("kind").notNull(),
    status: text("status").$type<TenantExpansionStatus>().notNull().default("identified"),
    score: integer("score").notNull(),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    monthlyPriceCents: integer("monthly_price_cents"),
    generatedBy: text("generated_by").notNull().default("revenue_scout"),
    presentedAt: timestamp("presented_at"),
    acceptedAt: timestamp("accepted_at"),
    rejectedAt: timestamp("rejected_at"),
    contractedAt: timestamp("contracted_at"),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index("tenant_expansion_recommendations_tenant_status_idx").on(table.tenantId, table.status),
    tenantScoreIdx: index("tenant_expansion_recommendations_tenant_score_idx").on(table.tenantId, table.score),
    openRecommendationUq: uniqueIndex("tenant_expansion_recommendations_open_uq")
      .on(table.tenantId, table.commercialKey)
      .where(sql`${table.active} = true AND ${table.status} IN ('identified','presented','accepted')`),
  }),
);

export type TenantExpansionRecommendation = typeof tenantExpansionRecommendationsTable.$inferSelect;
