import { pgTable, text, timestamp, numeric, unique, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const subscriptionPlanoEnum = pgEnum("subscription_plano", [
  "starter",
  "growth",
  "enterprise",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "ativa",
  "inadimplente",
  "cancelada",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal value"));

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    plano: subscriptionPlanoEnum("plano").notNull(),
    valorMensal: numeric("valor_mensal", { precision: 12, scale: 2 }).notNull(),
    status: subscriptionStatusEnum("status").notNull().default("trial"),
    asaasCustomerId: text("asaas_customer_id"),
    asaasSubscriptionId: text("asaas_subscription_id"),
    dataInicio: timestamp("data_inicio").notNull(),
    proximaCobranca: timestamp("proxima_cobranca"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("subscriptions_tenant_id_unique").on(t.tenantId)]
);

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable, {
  valorMensal: decimalField,
  dataInicio: z.coerce.date(),
  proximaCobranca: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateSubscriptionSchema = createSelectSchema(subscriptionsTable, {
  valorMensal: decimalField.optional(),
  dataInicio: z.coerce.date().optional(),
  proximaCobranca: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type UpdateSubscription = z.infer<typeof updateSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
