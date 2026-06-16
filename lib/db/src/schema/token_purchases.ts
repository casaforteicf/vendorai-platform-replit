import { pgTable, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const tokenPurchasesTable = pgTable("token_purchases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
  credits: integer("credits").notNull(),
  asaasChargeId: text("asaas_charge_id"),
  asaasCustomerId: text("asaas_customer_id"),
  status: text("status").notNull().default("pending"),
  invoiceUrl: text("invoice_url"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTokenPurchaseSchema = createInsertSchema(tokenPurchasesTable).omit({
  id: true,
  createdAt: true,
});

export const updateTokenPurchaseSchema = createSelectSchema(tokenPurchasesTable)
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type TokenPurchase = typeof tokenPurchasesTable.$inferSelect;
export type InsertTokenPurchase = z.infer<typeof insertTokenPurchaseSchema>;
