import { pgTable, text, boolean, timestamp, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export const platformRoleEnum = pgEnum("platform_role", [
  "super_admin",
  "tenant_admin",
  "tenant_seller",
  "partner",
  "member",
]);

export const userFunctionEnum = pgEnum("user_function", [
  "vendedor",
  "financeiro",
  "suporte",
  "entrega",
  "administrador",
  "outro",
]);

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  platformRole: platformRoleEnum("platform_role").notNull().default("member"),
  userFunction: userFunctionEnum("user_function").default("outro"),
  telefone: text("telefone"),
  active: boolean("active").notNull().default(true),
  forcePasswordReset: boolean("force_password_reset").notNull().default(false),
  lastAssignedAt: timestamp("last_assigned_at"),
  limiteEntregasPorTurno: numeric("limite_entregas_por_turno", { precision: 6, scale: 0 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserSchema = createSelectSchema(usersTable)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof usersTable.$inferSelect;
