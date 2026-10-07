import { pgTable, text, timestamp, numeric, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { dealsTable } from "./deals";
import { erpTitulosTable, erpPagamentosTable } from "./erp_financeiro";

export const tenantCommercialPartnershipsTable = pgTable("tenant_commercial_partnerships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerTenantId: text("owner_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  partnerTenantId: text("partner_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull().default("representante_comercial"),
  status: text("status").notNull().default("active"),
  defaultCommissionPercent: numeric("default_commission_percent", { precision: 7, scale: 4 }).notNull().default("15"),
  defaultPermissions: jsonb("default_permissions").$type<string[]>().notNull().default([]),
  authorizedUserIds: jsonb("authorized_user_ids").$type<string[]>().notNull().default([]),
  distributionMode: text("distribution_mode").notNull().default("partner_queue"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tenant_commercial_partnership_unique").on(table.ownerTenantId, table.partnerTenantId, table.relationshipType),
  index("tenant_commercial_partnership_owner_idx").on(table.ownerTenantId, table.status),
  index("tenant_commercial_partnership_partner_idx").on(table.partnerTenantId, table.status),
]);

export const dealTenantParticipationsTable = pgTable("deal_tenant_participations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  ownerTenantId: text("owner_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  partnerTenantId: text("partner_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  partnershipId: text("partnership_id").references(() => tenantCommercialPartnershipsTable.id, { onDelete: "set null" }),
  role: text("role").notNull().default("responsible"),
  status: text("status").notNull().default("active"),
  operationalUserId: text("operational_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Função/equipe externa que representa este tenant dentro da empresa de origem
  // (comercial, transporte, instalação, suporte etc.).
  functionId: text("function_id"),
  // Cada tenant mantém sua própria posição do mesmo negócio. Assim o card pode
  // aparecer simultaneamente nas pipelines das empresas participantes sem duplicar o negócio.
  pipeline: text("pipeline").notNull().default("comercial"),
  stage: text("stage"),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }),
  stageDueAt: timestamp("stage_due_at", { withTimezone: true }),
  lastHandoffFromTenantId: text("last_handoff_from_tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  lastHandoffAt: timestamp("last_handoff_at", { withTimezone: true }),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  commissionType: text("commission_type").notNull().default("percent"),
  commissionPercent: numeric("commission_percent", { precision: 7, scale: 4 }).notNull().default("15"),
  commissionFixedAmount: numeric("commission_fixed_amount", { precision: 14, scale: 2 }),
  sharedByUserId: text("shared_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("deal_tenant_participation_unique").on(table.dealId, table.partnerTenantId),
  index("deal_tenant_participation_partner_idx").on(table.partnerTenantId, table.status),
  index("deal_tenant_participation_owner_idx").on(table.ownerTenantId, table.status),
]);

export const intercompanyCommissionsTable = pgTable("intercompany_commissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  participationId: text("participation_id").notNull().references(() => dealTenantParticipationsTable.id, { onDelete: "cascade" }),
  payerTenantId: text("payer_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  beneficiaryTenantId: text("beneficiary_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  commissionType: text("commission_type").notNull().default("percent"),
  percent: numeric("percent", { precision: 7, scale: 4 }).notNull().default("15"),
  fixedAmount: numeric("fixed_amount", { precision: 14, scale: 2 }),
  baseAmount: numeric("base_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("prevista"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  payerTitleId: text("payer_title_id").references(() => erpTitulosTable.id, { onDelete: "set null" }),
  beneficiaryTitleId: text("beneficiary_title_id").references(() => erpTitulosTable.id, { onDelete: "set null" }),
  adjustedByUserId: text("adjusted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  adjustmentReason: text("adjustment_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("intercompany_commission_participation_unique").on(table.participationId),
  index("intercompany_commission_payer_idx").on(table.payerTenantId, table.status),
  index("intercompany_commission_beneficiary_idx").on(table.beneficiaryTenantId, table.status),
]);

export const intercompanyCommissionPaymentsTable = pgTable("intercompany_commission_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  commissionId: text("commission_id").notNull().references(() => intercompanyCommissionsTable.id, { onDelete: "cascade" }),
  payerTenantId: text("payer_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  beneficiaryTenantId: text("beneficiary_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  payerAccount: text("payer_account").notNull(),
  beneficiaryAccount: text("beneficiary_account").notNull(),
  paymentMethod: text("payment_method"),
  proofUrl: text("proof_url"),
  notes: text("notes"),
  payerPaymentId: text("payer_payment_id").references(() => erpPagamentosTable.id, { onDelete: "set null" }),
  beneficiaryPaymentId: text("beneficiary_payment_id").references(() => erpPagamentosTable.id, { onDelete: "set null" }),
  paidByUserId: text("paid_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("intercompany_commission_payment_commission_idx").on(table.commissionId, table.paidAt),
]);

const permissionSchema = z.array(z.string().trim().min(1)).max(100);

export const createTenantCommercialPartnershipSchema = createInsertSchema(tenantCommercialPartnershipsTable, {
  defaultCommissionPercent: z.union([z.string(), z.number()]).transform(String).default("15"),
  defaultPermissions: permissionSchema.default([]),
  authorizedUserIds: z.array(z.string()).max(200).default([]),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateTenantCommercialPartnershipSchema = createSelectSchema(tenantCommercialPartnershipsTable, {
  defaultCommissionPercent: z.union([z.string(), z.number()]).transform(String).optional(),
  defaultPermissions: permissionSchema.optional(),
  authorizedUserIds: z.array(z.string()).max(200).optional(),
}).omit({ id: true, ownerTenantId: true, partnerTenantId: true, createdAt: true, updatedAt: true }).partial();

export type TenantCommercialPartnership = typeof tenantCommercialPartnershipsTable.$inferSelect;
export type DealTenantParticipation = typeof dealTenantParticipationsTable.$inferSelect;
export type IntercompanyCommission = typeof intercompanyCommissionsTable.$inferSelect;
