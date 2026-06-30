import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

export const partnerTenantsTable = pgTable(
  "partner_tenants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    partnerId: text("partner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("partner_tenants_partner_tenant_idx").on(table.partnerId, table.tenantId),
  ]
);

export type PartnerTenant = typeof partnerTenantsTable.$inferSelect;
