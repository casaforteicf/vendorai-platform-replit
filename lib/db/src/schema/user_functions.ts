import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const userFunctionsTable = pgTable("user_functions", {
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

export const insertUserFunctionSchema = createInsertSchema(userFunctionsTable, {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  permissions: z.array(z.string()),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserFunctionSchema = createSelectSchema(userFunctionsTable, {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullable(),
  permissions: z.array(z.string()),
})
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type InsertUserFunction = z.infer<typeof insertUserFunctionSchema>;
export type UpdateUserFunction = z.infer<typeof updateUserFunctionSchema>;
export type UserFunctionDefinition = typeof userFunctionsTable.$inferSelect;
