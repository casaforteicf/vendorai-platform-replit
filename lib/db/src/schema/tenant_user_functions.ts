import { pgTable, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const tenantUserFunctionsTable = pgTable("tenant_user_functions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const createTenantUserFunctionSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).nullable().optional(),
  permissions: z.array(z.string()).min(1),
  active: z.boolean().optional(),
});

export const updateTenantUserFunctionSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(240).nullable(),
    permissions: z.array(z.string()).min(1),
    active: z.boolean(),
  })
  .partial();

export type TenantUserFunction = typeof tenantUserFunctionsTable.$inferSelect;
