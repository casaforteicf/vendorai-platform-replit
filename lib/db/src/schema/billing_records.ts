import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";

export const billingRecordsTable = pgTable("billing_records", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  asaasPaymentId: text("asaas_payment_id"),
  invoiceUrl: text("invoice_url"),
  valor: numeric("valor", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("pending"),
  splitPercent: numeric("split_percent", { precision: 5, scale: 2 }),
  partnerWalletId: text("partner_wallet_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBillingRecordSchema = createInsertSchema(billingRecordsTable, {
  valor: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
  splitPercent: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateBillingRecordSchema = createSelectSchema(billingRecordsTable, {
  valor: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
  splitPercent: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertBillingRecord = z.infer<typeof insertBillingRecordSchema>;
export type UpdateBillingRecord = z.infer<typeof updateBillingRecordSchema>;
export type BillingRecord = typeof billingRecordsTable.$inferSelect;
