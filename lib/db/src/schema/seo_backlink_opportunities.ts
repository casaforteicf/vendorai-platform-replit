import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const seoBacklinkOpportunitiesTable = pgTable(
  "seo_backlink_opportunities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sourceDomain: text("source_domain").notNull(),
    sourceUrl: text("source_url"),
    targetUrl: text("target_url").notNull(),
    priorityCluster: text("priority_cluster"),
    status: text("status").notNull().default("identified"),
    liveUrl: text("live_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    wonAt: timestamp("won_at"),
  },
  (table) => [
    index("seo_backlink_opportunities_tenant_idx").on(table.tenantId),
    index("seo_backlink_opportunities_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const backlinkOpportunityStatuses = [
  "identified",
  "contacted",
  "negotiating",
  "won",
  "lost",
] as const;

export const insertSeoBacklinkOpportunitySchema = createInsertSchema(seoBacklinkOpportunitiesTable, {
  sourceDomain: z.string().trim().min(2).max(255),
  sourceUrl: z.string().trim().url().max(2000).nullable().optional(),
  targetUrl: z.string().trim().min(1).max(2000),
  priorityCluster: z.string().trim().max(255).nullable().optional(),
  status: z.enum(backlinkOpportunityStatuses).optional(),
  liveUrl: z.string().trim().url().max(2000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  wonAt: z.coerce.date().nullable().optional(),
}).omit({ id: true });

export const updateSeoBacklinkOpportunitySchema = createSelectSchema(seoBacklinkOpportunitiesTable, {
  sourceDomain: z.string().trim().min(2).max(255),
  sourceUrl: z.string().trim().url().max(2000).nullable().optional(),
  targetUrl: z.string().trim().min(1).max(2000),
  priorityCluster: z.string().trim().max(255).nullable().optional(),
  status: z.enum(backlinkOpportunityStatuses),
  liveUrl: z.string().trim().url().max(2000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  updatedAt: z.coerce.date().optional(),
  wonAt: z.coerce.date().nullable().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type SeoBacklinkOpportunity = typeof seoBacklinkOpportunitiesTable.$inferSelect;
export type InsertSeoBacklinkOpportunity = z.infer<typeof insertSeoBacklinkOpportunitySchema>;
export type UpdateSeoBacklinkOpportunity = z.infer<typeof updateSeoBacklinkOpportunitySchema>;
