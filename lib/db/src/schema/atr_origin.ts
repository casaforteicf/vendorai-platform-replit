import { boolean, bigint, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const atrIdentityOriginsTable = pgTable("atr_identity_origins", {
 id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
 identityKind: text("identity_kind").$type<"person"|"organization">().notNull(),
 identityId: text("identity_id").notNull(),
 originTenantId: text("origin_tenant_id").notNull().references(() => tenantsTable.id,{onDelete:"restrict"}),
 originPartnerId: text("origin_partner_id"),
 attributionMethod: text("attribution_method").notNull(),
 attributionReference: text("attribution_reference"),
 attributedAt: timestamp("attributed_at",{withTimezone:true}).notNull().defaultNow(),
 evidence: jsonb("evidence_json").$type<Record<string,unknown>>().notNull().default({}),
 createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t=>[uniqueIndex("atr_identity_origins_identity_uniq").on(t.identityKind,t.identityId)]);

export const atrOriginAgreementsTable = pgTable("atr_origin_agreements",{
 id:text("id").primaryKey().$defaultFn(()=>crypto.randomUUID()),
 originTenantId:text("origin_tenant_id").notNull().references(()=>tenantsTable.id,{onDelete:"restrict"}),
 originPartnerId:text("origin_partner_id"),
 version:integer("version").notNull(),
 status:text("status").$type<"draft"|"active"|"suspended"|"retired">().notNull().default("draft"),
 effectiveFrom:timestamp("effective_from",{withTimezone:true}).notNull(),
 effectiveUntil:timestamp("effective_until",{withTimezone:true}),
 currency:text("currency").notNull().default("BRL"),
 commissionBasis:text("commission_basis").notNull().default("platform_net_commission_received"),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("atr_origin_agreements_lookup_idx").on(t.originTenantId,t.status,t.effectiveFrom)]);

export const atrOriginAgreementCategoriesTable=pgTable("atr_origin_agreement_categories",{
 agreementId:text("agreement_id").notNull().references(()=>atrOriginAgreementsTable.id,{onDelete:"restrict"}),
 categoryCode:text("category_code").notNull(),
 sharePercent:numeric("share_percent",{precision:7,scale:4}).notNull(),
 enabled:boolean("enabled").notNull().default(true),
},t=>[uniqueIndex("atr_origin_agreement_categories_unique").on(t.agreementId,t.categoryCode)]);

export const atrCommissionAllocationsTable=pgTable("atr_commission_allocations",{
 id:text("id").primaryKey().$defaultFn(()=>crypto.randomUUID()),
 originId:text("origin_id").notNull().references(()=>atrIdentityOriginsTable.id,{onDelete:"restrict"}),
 agreementId:text("agreement_id").notNull().references(()=>atrOriginAgreementsTable.id,{onDelete:"restrict"}),
 beneficiaryTenantId:text("beneficiary_tenant_id").notNull().references(()=>tenantsTable.id,{onDelete:"restrict"}),
 sourceTenantId:text("source_tenant_id").notNull().references(()=>tenantsTable.id,{onDelete:"restrict"}),
 sourceType:text("source_type").notNull(),
 sourceId:text("source_id").notNull(),
 receiptId:text("receipt_id").notNull(),
 categoryCode:text("category_code").notNull(),
 agreementVersion:integer("agreement_version").notNull(),
 receivedPlatformCommissionCents:bigint("received_platform_commission_cents",{mode:"number"}).notNull(),
 sharePercent:numeric("share_percent",{precision:7,scale:4}).notNull(),
 allocatedCents:bigint("allocated_cents",{mode:"number"}).notNull(),
 status:text("status").$type<"accrued"|"approved"|"paid"|"reversed">().notNull().default("accrued"),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("atr_commission_allocations_receipt_uniq").on(t.sourceTenantId,t.receiptId,t.originId,t.agreementId)]);

export const atrCommissionAdjustmentsTable=pgTable("atr_commission_adjustments",{
 id:text("id").primaryKey().$defaultFn(()=>crypto.randomUUID()),
 allocationId:text("allocation_id").notNull().references(()=>atrCommissionAllocationsTable.id,{onDelete:"restrict"}),
 adjustmentType:text("adjustment_type").$type<"refund"|"chargeback"|"manual_correction">().notNull(),
 externalReference:text("external_reference").notNull(),
 deltaCents:bigint("delta_cents",{mode:"number"}).notNull(),
 reason:text("reason").notNull(),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("atr_commission_adjustments_reference_uniq").on(t.allocationId,t.adjustmentType,t.externalReference)]);
