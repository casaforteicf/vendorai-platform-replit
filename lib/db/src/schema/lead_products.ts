import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const leadProductsTable = pgTable("lead_products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  imagemUrl: text("imagem_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeadProductSchema = createInsertSchema(leadProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeadProductSchema = createSelectSchema(leadProductsTable)
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertLeadProduct = z.infer<typeof insertLeadProductSchema>;
export type UpdateLeadProduct = z.infer<typeof updateLeadProductSchema>;
export type LeadProduct = typeof leadProductsTable.$inferSelect;
