import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const INSURANCE_ACCOUNT_SIZES = ["pequena", "media", "grande"] as const;
export const INSURANCE_POSITION_STAGES = [
  "nao_aplicavel",
  "whitespace",
  "prospeccao",
  "qualificacao",
  "proposta_enviada",
  "negociacao",
  "ativo",
  "risco_renovacao",
  "fechado_perdido",
  "cancelado",
] as const;
export const INSURANCE_CLAIM_STATUS = [
  "aberto",
  "documentacao_pendente",
  "analise_seguradora",
  "aprovado_pago",
  "negado",
  "recurso",
] as const;

export const insuranceAccountProfilesTable = pgTable("insurance_account_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  cnae: text("cnae"),
  setor: text("setor"),
  porte: text("porte").$type<(typeof INSURANCE_ACCOUNT_SIZES)[number]>(),
  headcount: integer("headcount"),
  quantidadeFrota: integer("quantidade_frota"),
  patrimonioDeclarado: numeric("patrimonio_declarado", { precision: 16, scale: 2 }),
  operacaoRiscoElevado: boolean("operacao_risco_elevado").notNull().default(false),
  dadosConfirmadosEm: timestamp("dados_confirmados_em"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantAccountUnique: uniqueIndex("insurance_account_profiles_tenant_account_uidx").on(table.tenantId, table.accountId),
  tenantSectorIdx: index("insurance_account_profiles_tenant_sector_idx").on(table.tenantId, table.setor),
}));

export const insuranceProductsTable = pgTable("insurance_products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  defaultTermDays: integer("default_term_days").notNull().default(365),
  renewalLeadDays: integer("renewal_lead_days").notNull().default(90),
  targetProfile: jsonb("target_profile").$type<Record<string, unknown>>(),
  correlatedProductCodes: jsonb("correlated_product_codes").$type<string[]>(),
  communication: jsonb("communication").$type<{
    tone?: string;
    keywords?: string[];
    typicalQuestions?: string[];
  }>(),
  healthSensitive: boolean("health_sensitive").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantCodeUnique: uniqueIndex("insurance_products_tenant_code_uidx").on(table.tenantId, table.code),
}));

export const insuranceAccountProductPositionsTable = pgTable("insurance_account_product_positions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => insuranceProductsTable.id, { onDelete: "restrict" }),
  stage: text("stage").notNull().$type<(typeof INSURANCE_POSITION_STAGES)[number]>().default("whitespace"),
  policyNumber: text("policy_number"),
  insurerName: text("insurer_name"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  premium: numeric("premium", { precision: 14, scale: 2 }),
  insuredValue: numeric("insured_value", { precision: 16, scale: 2 }),
  deductible: numeric("deductible", { precision: 14, scale: 2 }),
  coverage: jsonb("coverage").$type<{ included?: string[]; excluded?: string[]; specialClauses?: string[] }>(),
  profileFitScore: numeric("profile_fit_score", { precision: 5, scale: 2 }),
  competitiveRisk: boolean("competitive_risk").notNull().default(false),
  renewalRisk: boolean("renewal_risk").notNull().default(false),
  source: text("source").notNull().default("manual"),
  verifiedByUserId: text("verified_by_user_id"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantAccountProductUnique: uniqueIndex("insurance_positions_tenant_account_product_uidx").on(table.tenantId, table.accountId, table.productId),
  tenantExpiryIdx: index("insurance_positions_tenant_expiry_idx").on(table.tenantId, table.effectiveTo),
  tenantStageIdx: index("insurance_positions_tenant_stage_idx").on(table.tenantId, table.stage),
}));

export const insurancePolicyClaimsTable = pgTable("insurance_policy_claims", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  positionId: text("position_id").notNull().references(() => insuranceAccountProductPositionsTable.id, { onDelete: "cascade" }),
  claimType: text("claim_type"),
  occurredAt: timestamp("occurred_at").notNull(),
  status: text("status").notNull().$type<(typeof INSURANCE_CLAIM_STATUS)[number]>().default("aberto"),
  estimatedValue: numeric("estimated_value", { precision: 14, scale: 2 }),
  paidValue: numeric("paid_value", { precision: 14, scale: 2 }),
  insurerDeadline: timestamp("insurer_deadline"),
  documents: jsonb("documents").$type<Array<{ name: string; url: string; type?: string }>>(),
  humanEscalationRequired: boolean("human_escalation_required").notNull().default(false),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantPositionIdx: index("insurance_claims_tenant_position_idx").on(table.tenantId, table.positionId),
  tenantStatusIdx: index("insurance_claims_tenant_status_idx").on(table.tenantId, table.status),
}));

const nonnegativeInt = z.number().int().nonnegative();
const nonnegativeDecimal = z.coerce.number().nonnegative();

export const insertInsuranceAccountProfileSchema = createInsertSchema(insuranceAccountProfilesTable, {
  porte: z.enum(INSURANCE_ACCOUNT_SIZES).optional(),
  headcount: nonnegativeInt.optional(),
  quantidadeFrota: nonnegativeInt.optional(),
  patrimonioDeclarado: nonnegativeDecimal.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateInsuranceAccountProfileSchema = createSelectSchema(insuranceAccountProfilesTable)
  .omit({ id: true, tenantId: true, accountId: true, createdAt: true, updatedAt: true })
  .partial();

export const insertInsuranceProductSchema = createInsertSchema(insuranceProductsTable, {
  defaultTermDays: z.number().int().positive(),
  renewalLeadDays: z.number().int().positive(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertInsurancePositionSchema = createInsertSchema(insuranceAccountProductPositionsTable, {
  stage: z.enum(INSURANCE_POSITION_STAGES),
  premium: nonnegativeDecimal.optional(),
  insuredValue: nonnegativeDecimal.optional(),
  deductible: nonnegativeDecimal.optional(),
  profileFitScore: z.coerce.number().min(0).max(100).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateInsurancePositionSchema = createSelectSchema(insuranceAccountProductPositionsTable, {
  stage: z.enum(INSURANCE_POSITION_STAGES).optional(),
}).omit({ id: true, tenantId: true, accountId: true, productId: true, createdAt: true, updatedAt: true }).partial();

export const insertInsurancePolicyClaimSchema = createInsertSchema(insurancePolicyClaimsTable, {
  status: z.enum(INSURANCE_CLAIM_STATUS),
  estimatedValue: nonnegativeDecimal.optional(),
  paidValue: nonnegativeDecimal.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsuranceAccountProfile = typeof insuranceAccountProfilesTable.$inferSelect;
export type InsuranceProduct = typeof insuranceProductsTable.$inferSelect;
export type InsuranceAccountProductPosition = typeof insuranceAccountProductPositionsTable.$inferSelect;
export type InsurancePolicyClaim = typeof insurancePolicyClaimsTable.$inferSelect;
