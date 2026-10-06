import { pgTable, text, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";
import { crmPeopleMasterTable, crmCompaniesMasterTable } from "./crm_company_master";

export type DealPersonRole =
  | "consumidor_final"
  | "proprietario"
  | "contratante"
  | "comprador"
  | "contato_comercial"
  | "decisor"
  | "responsavel_financeiro"
  | "arquiteto"
  | "engenheiro"
  | "representante"
  | "instalador"
  | "parceiro"
  | "outro";

export type DealCompanyRole =
  | "contratante"
  | "construtora"
  | "incorporadora"
  | "imobiliaria"
  | "fornecedor"
  | "parceira"
  | "representante"
  | "outra";

export const crmDealPeopleTable = pgTable("crm_deal_people", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => crmPeopleMasterTable.id, { onDelete: "cascade" }),
  role: text("role").$type<DealPersonRole>().notNull().default("outro"),
  isPrimary: boolean("is_primary").notNull().default(false),
  contextualCompanyId: text("contextual_company_id").references(() => crmCompaniesMasterTable.id, { onDelete: "set null" }),
  relationshipScope: text("relationship_scope").$type<"deal_only" | "persistent">().notNull().default("deal_only"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dealPersonUnique: uniqueIndex("crm_deal_people_deal_person_uidx").on(table.dealId, table.personId),
  tenantDealIdx: index("crm_deal_people_tenant_deal_idx").on(table.tenantId, table.dealId),
}));

export const crmDealCompaniesTable = pgTable("crm_deal_companies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  companyId: text("company_id").notNull().references(() => crmCompaniesMasterTable.id, { onDelete: "cascade" }),
  role: text("role").$type<DealCompanyRole>().notNull().default("outra"),
  isPrimary: boolean("is_primary").notNull().default(false),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dealCompanyUnique: uniqueIndex("crm_deal_companies_deal_company_uidx").on(table.dealId, table.companyId),
  tenantDealIdx: index("crm_deal_companies_tenant_deal_idx").on(table.tenantId, table.dealId),
}));
