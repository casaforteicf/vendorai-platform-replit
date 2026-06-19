import { pgTable, text, integer, numeric, timestamp, pgEnum, json, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
  "cancelled",
]);

export const tenantsTable = pgTable(
  "tenants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: tenantStatusEnum("status").notNull().default("active"),
    vertical: text("vertical"),
    agentsEnabled: json("agents_enabled")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    setupCompletedAt: timestamp("setup_completed_at"),
    autonomyEnabledAt: timestamp("autonomy_enabled_at"),
    monthlyTokenLimit: integer("monthly_token_limit"),
    tokensUsedCurrentMonth: integer("tokens_used_current_month")
      .notNull()
      .default(0),
    dailyMessageLimit: integer("daily_message_limit"),
    messagesSentToday: integer("messages_sent_today").notNull().default(0),
    analysisStalenessHours: integer("analysis_staleness_hours"),
    analysisMessageThreshold: integer("analysis_message_threshold"),
    maxAnalysesPerHour: integer("max_analyses_per_hour"),
    webhookEstoqueUrl: text("webhook_estoque_url"),
    apiKeyEstoque: text("api_key_estoque"),
    integrationType: text("integration_type").default("api"),
    tipoFechamentoDefault: text("tipo_fechamento_default").$type<"pedido" | "contrato" | "pedido_e_contrato">(),
    mensalidadeValor: numeric("mensalidade_valor", { precision: 10, scale: 2 }),
    tokenCredits: integer("token_credits").notNull().default(0),
    partnerId: text("partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
    subdomainSlug: text("subdomain_slug").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "analysis_staleness_hours_positive",
      sql`${table.analysisStalenessHours} IS NULL OR ${table.analysisStalenessHours} >= 1`,
    ),
    check(
      "analysis_message_threshold_positive",
      sql`${table.analysisMessageThreshold} IS NULL OR ${table.analysisMessageThreshold} >= 1`,
    ),
    check(
      "max_analyses_per_hour_positive",
      sql`${table.maxAnalysesPerHour} IS NULL OR ${table.maxAnalysesPerHour} >= 1`,
    ),
  ],
);

const positiveIntOrNull = z
  .int()
  .min(1, "Must be a positive integer (>= 1)")
  .nullable()
  .optional();

export const insertTenantSchema = createInsertSchema(tenantsTable)
  .omit({
    id: true,
    tokensUsedCurrentMonth: true,
    messagesSentToday: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    analysisStalenessHours: positiveIntOrNull,
    analysisMessageThreshold: positiveIntOrNull,
    maxAnalysesPerHour: positiveIntOrNull,
  });

export const updateTenantSchema = createSelectSchema(tenantsTable)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    analysisStalenessHours: positiveIntOrNull,
    analysisMessageThreshold: positiveIntOrNull,
    maxAnalysesPerHour: positiveIntOrNull,
  })
  .partial();

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type UpdateTenant = z.infer<typeof updateTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
