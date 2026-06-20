import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";

export const tenantAlertsTable = pgTable("tenant_alerts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  mensagem: text("mensagem").notNull(),
  urgente: boolean("urgente").notNull().default(false),
  lido: boolean("lido").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTenantAlertSchema = createInsertSchema(tenantAlertsTable).omit({
  id: true,
  createdAt: true,
});
export const selectTenantAlertSchema = createSelectSchema(tenantAlertsTable);

export type InsertTenantAlert = import("zod/v4").infer<typeof insertTenantAlertSchema>;
export type TenantAlert = typeof tenantAlertsTable.$inferSelect;
