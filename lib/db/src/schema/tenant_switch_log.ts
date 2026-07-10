import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tenantSwitchLogTable = pgTable("tenant_switch_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  fromTenantId: text("from_tenant_id").notNull(),
  toTenantId: text("to_tenant_id").notNull(),
  organizacaoId: text("organizacao_id").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TenantSwitchLog = typeof tenantSwitchLogTable.$inferSelect;
