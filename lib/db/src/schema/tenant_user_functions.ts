import { pgTable, text, jsonb, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";
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
  // Empresas externas de função comercial entram no mesmo motor de distribuição
  // dos usuários internos. As mesmas restrições de território/segmento/raio são
  // configuráveis por implantação.
  lastAssignedAt: timestamp("last_assigned_at"),
  leadAssignmentEnabled: boolean("lead_assignment_enabled"),
  leadAssignmentCities: jsonb("lead_assignment_cities").$type<string[]>().notNull().default([]),
  leadAssignmentRegions: jsonb("lead_assignment_regions").$type<string[]>().notNull().default([]),
  leadAssignmentSegments: jsonb("lead_assignment_segments").$type<string[]>().notNull().default([]),
  leadAssignmentLat: doublePrecision("lead_assignment_lat"),
  leadAssignmentLng: doublePrecision("lead_assignment_lng"),
  leadAssignmentRaioKm: doublePrecision("lead_assignment_raio_km"),
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
  leadAssignmentEnabled: z.boolean().nullable().optional(),
  leadAssignmentCities: z.array(z.string()).max(200).default([]),
  leadAssignmentRegions: z.array(z.string()).max(200).default([]),
  leadAssignmentSegments: z.array(z.string()).max(200).default([]),
  leadAssignmentLat: z.number().min(-90).max(90).nullable().optional(),
  leadAssignmentLng: z.number().min(-180).max(180).nullable().optional(),
  leadAssignmentRaioKm: z.number().positive().max(5000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "external_company" && !value.linkedTenantCode) {
    ctx.addIssue({ code: "custom", path: ["linkedTenantCode"], message: "Informe o código Vendor.ai da empresa representante." });
  }
});

export type TenantUserFunction = typeof tenantUserFunctionsTable.$inferSelect;
