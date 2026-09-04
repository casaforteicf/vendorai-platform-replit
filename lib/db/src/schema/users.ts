import { pgTable, text, boolean, timestamp, pgEnum, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { tenantUserFunctionsTable } from "./tenant_user_functions";

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
  customFunctionId: text("custom_function_id").references(() => tenantUserFunctionsTable.id, {
    onDelete: "set null",
  }),
  // Null keeps the legacy role-based defaults. Once configured, this array is
  // the user's explicit module allowlist.
  permissions: jsonb("permissions").$type<string[] | null>().default(null),
  telefone: text("telefone"),
  active: boolean("active").notNull().default(true),
  forcePasswordReset: boolean("force_password_reset").notNull().default(false),
  lastAssignedAt: timestamp("last_assigned_at"),
  // Regras de distribuição de leads. Null preserva a compatibilidade com usuários
  // antigos: vendedor/tenant_seller continua elegível até ser configurado explicitamente.
  leadAssignmentEnabled: boolean("lead_assignment_enabled"),
  leadAssignmentCities: jsonb("lead_assignment_cities").$type<string[]>().notNull().default([]),
  leadAssignmentRegions: jsonb("lead_assignment_regions").$type<string[]>().notNull().default([]),
  // Linha/segmento de produto atendido (ex: "Óleos & Lubrificantes" vs
  // "Peças de Motor"). Comparado contra leads.mercadoSegmento. Vazio = sem
  // restrição de segmento — mesmo padrão de compatibilidade das duas acima.
  leadAssignmentSegments: jsonb("lead_assignment_segments").$type<string[]>().notNull().default([]),
  limiteEntregasPorTurno: numeric("limite_entregas_por_turno", { precision: 6, scale: 0 }),
  // Última vez que o usuário abriu o painel de "Novidades" — usado só pra
  // calcular o contador de não lidas, nada além disso.
  changelogLidoEm: timestamp("changelog_lido_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable, {
  permissions: z.array(z.string()).nullable(),
  leadAssignmentCities: z.array(z.string()),
  leadAssignmentRegions: z.array(z.string()),
  leadAssignmentSegments: z.array(z.string()),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserSchema = createSelectSchema(usersTable, {
  permissions: z.array(z.string()).nullable(),
  leadAssignmentCities: z.array(z.string()),
  leadAssignmentRegions: z.array(z.string()),
  leadAssignmentSegments: z.array(z.string()),
})
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
