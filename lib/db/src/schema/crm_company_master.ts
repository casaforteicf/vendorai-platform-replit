import { pgTable, text, timestamp, jsonb, boolean, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export type CompanyContactPurpose =
  | "comercial"
  | "decisor"
  | "compras"
  | "financeiro"
  | "tecnico"
  | "administrativo"
  | "suporte"
  | "outro";

export type CompanyRelationshipType =
  | "grupo_economico"
  | "controladora"
  | "controlada"
  | "matriz"
  | "filial"
  | "coligada"
  | "parceira"
  | "outra";

export const crmCompaniesMasterTable = pgTable("crm_companies_master", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cnpj: text("cnpj").notNull(),
  razaoSocial: text("razao_social"),
  nomeFantasia: text("nome_fantasia"),
  situacaoCadastral: text("situacao_cadastral"),
  naturezaJuridica: text("natureza_juridica"),
  porte: text("porte"),
  capitalSocial: numeric("capital_social", { precision: 18, scale: 2 }),
  dataAbertura: text("data_abertura"),
  cnaePrincipal: text("cnae_principal"),
  cnaesSecundarios: jsonb("cnaes_secundarios").$type<Array<{ codigo?: string; descricao?: string }>>().default([]),
  endereco: jsonb("endereco").$type<{
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
    pais?: string | null;
  }>(),
  telefone: text("telefone"),
  email: text("email"),
  website: text("website"),
  socialProfiles: jsonb("social_profiles").$type<Record<string, string>>().default({}),
  enrichmentData: jsonb("enrichment_data").$type<Record<string, unknown>>().default({}),
  source: text("source").notNull().default("manual"),
  enrichedAt: timestamp("enriched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  cnpjUnique: uniqueIndex("crm_companies_master_cnpj_uidx").on(table.cnpj),
  razaoSocialIdx: index("crm_companies_master_razao_social_idx").on(table.razaoSocial),
}));

export const crmPeopleMasterTable = pgTable("crm_people_master", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nome: text("nome").notNull(),
  documento: text("documento"),
  dataNascimento: text("data_nascimento"),
  telefones: jsonb("telefones").$type<string[]>().default([]),
  emails: jsonb("emails").$type<string[]>().default([]),
  socialProfiles: jsonb("social_profiles").$type<Record<string, string>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  documentoIdx: index("crm_people_master_documento_idx").on(table.documento),
  nomeIdx: index("crm_people_master_nome_idx").on(table.nome),
}));

export const crmCompanyPeopleTable = pgTable("crm_company_people", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull().references(() => crmCompaniesMasterTable.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => crmPeopleMasterTable.id, { onDelete: "cascade" }),
  cargo: text("cargo"),
  qualificacao: text("qualificacao"),
  participacao: numeric("participacao", { precision: 7, scale: 4 }),
  isLegalRepresentative: boolean("is_legal_representative").notNull().default(false),
  source: text("source").notNull().default("manual"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  companyPersonUnique: uniqueIndex("crm_company_people_company_person_uidx").on(table.companyId, table.personId),
  companyIdx: index("crm_company_people_company_idx").on(table.companyId),
}));

export const crmTenantCompaniesTable = pgTable("crm_tenant_companies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  companyId: text("company_id").notNull().references(() => crmCompaniesMasterTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  relationshipType: text("relationship_type").notNull().default("lead"),
  status: text("status").notNull().default("ativo"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantCompanyUnique: uniqueIndex("crm_tenant_companies_tenant_company_uidx").on(table.tenantId, table.companyId),
  tenantLeadIdx: index("crm_tenant_companies_tenant_lead_idx").on(table.tenantId, table.leadId),
}));

export const crmTenantCompanyContactsTable = pgTable("crm_tenant_company_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  tenantCompanyId: text("tenant_company_id").notNull().references(() => crmTenantCompaniesTable.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => crmPeopleMasterTable.id, { onDelete: "cascade" }),
  roles: jsonb("roles").$type<CompanyContactPurpose[]>().notNull().default([]),
  isPrimary: boolean("is_primary").notNull().default(false),
  preferredChannel: text("preferred_channel"),
  priorityByPurpose: jsonb("priority_by_purpose").$type<Partial<Record<CompanyContactPurpose, number>>>().default({}),
  roleEvidence: jsonb("role_evidence").$type<Array<{ source: string; detail?: string; observedAt?: string }>>().default([]),
  roleConfidence: numeric("role_confidence", { precision: 5, scale: 2 }),
  verifiedAt: timestamp("verified_at"),
  validUntil: timestamp("valid_until"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantCompanyPersonUnique: uniqueIndex("crm_tenant_company_contacts_tc_person_uidx").on(table.tenantCompanyId, table.personId),
  tenantIdx: index("crm_tenant_company_contacts_tenant_idx").on(table.tenantId),
  tenantCompanyIdx: index("crm_tenant_company_contacts_company_idx").on(table.tenantCompanyId),
}));


export const crmCompanyRelationshipsTable = pgTable("crm_company_relationships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentCompanyId: text("parent_company_id").notNull().references(() => crmCompaniesMasterTable.id, { onDelete: "cascade" }),
  childCompanyId: text("child_company_id").notNull().references(() => crmCompaniesMasterTable.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").$type<CompanyRelationshipType>().notNull(),
  source: text("source").notNull().default("manual"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  verifiedAt: timestamp("verified_at"),
  validUntil: timestamp("valid_until"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  parentChildUnique: uniqueIndex("crm_company_relationships_parent_child_type_uidx").on(
    table.parentCompanyId,
    table.childCompanyId,
    table.relationshipType,
  ),
  parentIdx: index("crm_company_relationships_parent_idx").on(table.parentCompanyId),
  childIdx: index("crm_company_relationships_child_idx").on(table.childCompanyId),
}));