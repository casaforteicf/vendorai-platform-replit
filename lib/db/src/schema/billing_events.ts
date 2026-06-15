import { pgTable, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const billingEventTypeEnum = pgEnum("billing_event_type", [
  "initial",
  "monthly",
]);

export const billingEventStatusEnum = pgEnum("billing_event_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);

export const billingEventsTable = pgTable("billing_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  mes: text("mes"),
  tipo: billingEventTypeEnum("tipo").notNull(),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
  asaasChargeId: text("asaas_charge_id"),
  asaasCustomerId: text("asaas_customer_id"),
  status: billingEventStatusEnum("status").notNull().default("pending"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBillingEventSchema = createInsertSchema(billingEventsTable).omit({
  id: true,
  createdAt: true,
});

export const updateBillingEventSchema = createSelectSchema(billingEventsTable)
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type BillingEvent = typeof billingEventsTable.$inferSelect;
export type InsertBillingEvent = z.infer<typeof insertBillingEventSchema>;
