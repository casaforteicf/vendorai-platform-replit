import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const productPresentationsTable = pgTable("product_presentations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  catalogProductId: text("catalog_product_id"),
  status: text("status").notNull().default("draft"),
  htmlContent: text("html_content").notNull(),
  jsonContent: text("json_content").notNull(),
  webSources: jsonb("web_sources").$type<{ url: string; title: string; snippet: string }[] | null>(),
  reviewedBy: text("reviewed_by"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductPresentationSchema = createInsertSchema(productPresentationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProductPresentationSchema = createSelectSchema(productPresentationsTable)
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertProductPresentation = z.infer<typeof insertProductPresentationSchema>;
export type UpdateProductPresentation = z.infer<typeof updateProductPresentationSchema>;
export type ProductPresentation = typeof productPresentationsTable.$inferSelect;
