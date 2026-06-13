import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { subscriptionsTable } from "./subscriptions";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pendente",
  "paga",
  "atrasada",
  "cancelada",
]);

export const invoiceFormaPagamentoEnum = pgEnum("invoice_forma_pagamento", [
  "pix",
  "cartao",
  "boleto",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal value"));

export const invoicesTable = pgTable("invoices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id")
    .notNull()
    .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  status: invoiceStatusEnum("status").notNull().default("pendente"),
  formaPagamento: invoiceFormaPagamentoEnum("forma_pagamento"),
  asaasInvoiceId: text("asaas_invoice_id"),
  linkPagamento: text("link_pagamento"),
  dataVencimento: timestamp("data_vencimento").notNull(),
  dataPagamento: timestamp("data_pagamento"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable, {
  valor: decimalField,
  dataVencimento: z.coerce.date(),
  dataPagamento: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateInvoiceSchema = createSelectSchema(invoicesTable, {
  valor: decimalField.optional(),
  dataVencimento: z.coerce.date().optional(),
  dataPagamento: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, subscriptionId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type UpdateInvoice = z.infer<typeof updateInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
