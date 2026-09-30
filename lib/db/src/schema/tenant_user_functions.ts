import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
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
  systemKey: text("system_key").$type<"vendedor" | "representante_comercial" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro">(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  kind: text("kind").$type<"internal" | "external_company">().notNull().default("internal"),
  linkedTenantId: text("linked_tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  linkedTenantCode: text("linked_tenant_code"),
  leadAccessScope: text("lead_access_scope").$type<"assigned" | "territory" | "all_authorized">().notNull().default("assigned"),
  representativeUserIds: jsonb("representative_user_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const createTenantUserFunctionSchema = z.object({
  name: z.string().trim().min(2).max(60),
  systemKey: z.enum(["vendedor", "representante_comercial", "financeiro", "suporte", "entrega", "administrador", "outro"]).nullable().optional(),
  permissions: z.array(z.string()).min(1),
  kind: z.enum(["internal", "external_company"]).default("internal"),
  linkedTenantCode: z.string().trim().min(3).max(32).nullable().optional(),
  leadAccessScope: z.enum(["assigned", "territory", "all_authorized"]).default("assigned"),
  representativeUserIds: z.array(z.string()).max(200).default([]),
}).superRefine((value, ctx) => {
  if (value.kind === "external_company" && !value.linkedTenantCode) {
    ctx.addIssue({ code: "custom", path: ["linkedTenantCode"], message: "Informe o código Vendor.ai da empresa representante." });
  }
});

export type TenantUserFunction = typeof tenantUserFunctionsTable.$inferSelect;
