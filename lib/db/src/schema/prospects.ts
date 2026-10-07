import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { crmCompaniesMasterTable } from "./crm_company_master";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";

export const prospectStageEnum = [
  "encontrado",
  "analisado",
  "em_contato",
  "conta_mapeada",
  "oportunidade_identificada",
  "reuniao_em_negociacao",
  "reuniao_agendada",
  "qualificado",
  "aquecimento",
  "sem_aderencia",
  "sem_contato",
  "nao_contatar",
] as const;

export const prospectSolutionEnum = [
  "undefined",
  "vendorai",
  "arqdor",
  "vendorai_arqdor",
] as const;

export type ProspectStage = typeof prospectStageEnum[number];
export type ProspectSolution = typeof prospectSolutionEnum[number];

export type ProspectQualification = {
  commercial?: {
    crmAtual?: string | null;
    origemLeads?: string[] | null;
    canaisAtendimento?: string[] | null;
    modeloFollowup?: string | null;
    equipeComercial?: number | null;
    volumeLeads?: number | null;
  };
  project?: {
    recebeProjetos?: boolean | null;
    formatosProjetos?: string[] | null;
    softwareProjeto?: string | null;
    volumeProjetos?: number | null;
    responsavelAnalise?: string | null;
    processoLevantamento?: string | null;
  };
  budget?: {
    softwareOrcamento?: string | null;
    usaPlanilha?: boolean | null;
    tempoMedioOrcamento?: string | null;
    responsavelOrcamento?: string | null;
    retrabalho?: string | null;
    gargalos?: string[] | null;
  };
  management?: {
    controleTarefas?: string | null;
    controlePipeline?: string | null;
    indicadores?: string | null;
    integracaoSetores?: string | null;
  };
  confirmedPains?: string[];
  inferredPains?: string[];
  urgency?: "baixa" | "media" | "alta" | null;
  impact?: "baixo" | "medio" | "alto" | null;
  facts?: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: string;
    confirmed: boolean;
    observedAt?: string;
  }>;
};

export const prospectsTable = pgTable("prospects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => crmCompaniesMasterTable.id, { onDelete: "set null" }),
  displayName: text("display_name"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  segment: text("segment"),
  city: text("city"),
  source: text("source").notNull().default("prospector"),
  sourceRef: text("source_ref"),
  stage: text("stage").$type<ProspectStage>().notNull().default("encontrado"),

  fitScore: integer("fit_score"),
  vendoraiFitScore: integer("vendorai_fit_score"),
  arqdorFitScore: integer("arqdor_fit_score"),
  recommendedSolution: text("recommended_solution").$type<ProspectSolution>().notNull().default("undefined"),
  primaryHook: text("primary_hook").$type<"vendorai" | "arqdor" | "diagnostico" | null>(),

  currentState: text("current_state"),
  currentObjective: text("current_objective"),
  nextBestAction: text("next_best_action"),
  nextBestActionReason: text("next_best_action_reason"),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),

  qualificationScore: integer("qualification_score"),
  qualification: jsonb("qualification").$type<ProspectQualification>().notNull().default({}),
  opportunitySummary: text("opportunity_summary"),

  assignedUserId: text("assigned_user_id"),
  assignedAgentId: text("assigned_agent_id"),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),

  convertedLeadId: text("converted_lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  convertedDealId: text("converted_deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantCompanyUnique: uniqueIndex("prospects_tenant_company_uidx").on(table.tenantId, table.companyId),
  tenantSourceRefUnique: uniqueIndex("prospects_tenant_source_ref_uidx").on(table.tenantId, table.source, table.sourceRef),
  tenantStageIdx: index("prospects_tenant_stage_idx").on(table.tenantId, table.stage),
  nextActionIdx: index("prospects_next_action_idx").on(table.tenantId, table.nextActionAt),
}));

export const insertProspectSchema = createInsertSchema(prospectsTable, {
  stage: z.enum(prospectStageEnum).optional(),
  recommendedSolution: z.enum(prospectSolutionEnum).optional(),
  fitScore: z.number().int().min(0).max(100).nullable().optional(),
  vendoraiFitScore: z.number().int().min(0).max(100).nullable().optional(),
  arqdorFitScore: z.number().int().min(0).max(100).nullable().optional(),
  qualificationScore: z.number().int().min(0).max(100).nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProspectSchema = createSelectSchema(prospectsTable, {
  stage: z.enum(prospectStageEnum).optional(),
  recommendedSolution: z.enum(prospectSolutionEnum).optional(),
  fitScore: z.number().int().min(0).max(100).nullable().optional(),
  vendoraiFitScore: z.number().int().min(0).max(100).nullable().optional(),
  arqdorFitScore: z.number().int().min(0).max(100).nullable().optional(),
  qualificationScore: z.number().int().min(0).max(100).nullable().optional(),
}).partial().omit({
  id: true,
  tenantId: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});

export type Prospect = typeof prospectsTable.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type UpdateProspect = z.infer<typeof updateProspectSchema>;
