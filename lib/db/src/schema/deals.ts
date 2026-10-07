import { pgTable, text, timestamp, numeric, integer, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { funisTable } from "./funis";
import { usersTable } from "./users";

export const dealEtapaEnum = pgEnum("deal_etapa", [
  "em_aquecimento",
  "novo",
  "qualificado",
  "proposta",
  "negociacao",
  "conferencia_estoque",
  "ganho",
  "em_execucao",
  "entregue",
  "perdido",
  "parceiro",
]);

export const dealTipoFechamentoEnum = pgEnum("deal_tipo_fechamento", [
  "pedido",
  "contrato",
  "pedido_e_contrato",
]);

export const dealCobrancaTipoEnum = pgEnum("deal_cobranca_tipo", [
  "automatico",
  "manual",
]);

export const dealsTable = pgTable("deals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  titulo: text("titulo").notNull(),
  valor: numeric("valor", { precision: 12, scale: 2 }),
  // Era pgEnum(dealEtapaEnum) — virou texto livre em favor de etapas
  // customizáveis por tenant (ver pipeline_stages.ts). Os 11 valores do
  // enum antigo continuam sendo os únicos com automação de verdade
  // (contrato/cobrança/reativação) amarrada nos ~29 arquivos do
  // backend que comparam contra essas strings literais — nada nesses
  // arquivos precisou mudar, o valor da string é idêntico.
  etapa: text("etapa").notNull().default("novo"),
  funilId: text("funil_id").references(() => funisTable.id, { onDelete: "set null" }),
  probabilidade: integer("probabilidade").default(0),
  dataFechamentoPrevista: timestamp("data_fechamento_prevista"),
  categoriaPerda: text("categoria_perda"),
  motivoPerda: text("motivo_perda"),
  // Closure tracking
  closureTriggeredAt: timestamp("closure_triggered_at"),
  dataFechamento: timestamp("data_fechamento"),
  contractStatus: text("contract_status"),
  contractError: text("contract_error"),
  onboardingStatus: text("onboarding_status"),
  onboardingError: text("onboarding_error"),
  zapsignDocId: text("zapsign_doc_id"),
  // Won deal tracking
  wonAt: timestamp("won_at"),
  // Lost deal tracking
  lostAt: timestamp("lost_at"),
  lostReason: text("lost_reason"),
  lostReasonDetail: text("lost_reason_detail"),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  tipoFechamento: dealTipoFechamentoEnum("tipo_fechamento"),
  asaasChargeId: text("asaas_charge_id"),
  chargeLink: text("charge_link"),
  chargeStatus: text("charge_status"),
  // SaaS pipeline fields
  etapaSaas: text("etapa_saas"),
  mrr: numeric("mrr", { precision: 12, scale: 2 }),
  arr: numeric("arr", { precision: 12, scale: 2 }),
  seats: integer("seats"),
  planoContratado: text("plano_contratado"),
  dataRenovacao: timestamp("data_renovacao"),
  probChurn: integer("prob_churn"),
  quoteFileUrl: text("quote_file_url"),
  skipAsaasBilling: text("skip_asaas_billing"),
  // "automatico" quando o tenant tem Asaas configurado e a cobrança foi criada via API;
  // "manual" quando o tenant não tem conta Asaas própria e a cobrança precisa ser feita
  // manualmente pelo financeiro (fallback esperado, não um erro).
  cobrancaTipo: dealCobrancaTipoEnum("cobranca_tipo"),
  aquecimentoTipo: text("aquecimento_tipo"),
  relationshipStage: text("relationship_stage"),
  // Briefing gerado automaticamente pela IA no momento da prospecção
  aiBriefing: text("ai_briefing"),
  aiBriefingGeneratedAt: timestamp("ai_briefing_generated_at"),
  // Rastreabilidade de origem — já existiam no banco (criadas via migration
  // direta antes deste schema ser atualizado), adicionadas aqui pra bater
  // com a realidade do banco de produção.
  scoutOportunidadeId: text("scout_oportunidade_id"),
  grupoId: text("grupo_id"),
  origemPedidoPracaId: text("origem_pedido_praca_id"),
  vehicleReservationDueAt: timestamp("vehicle_reservation_due_at"),
  vehicleReservationBlocked: boolean("vehicle_reservation_blocked").notNull().default(false),
  // Quando a etapa mudou pela última vez — mantido por trigger no banco
  // (set_deal_etapa_alterada_em, migration 108), cobre qualquer UPDATE
  // de etapa não importa qual dos ~29 pontos do backend fez. Usado pro
  // SLA de tempo por etapa (card fica vermelho quando estoura).
  etapaAlteradaEm: timestamp("etapa_alterada_em").notNull().defaultNow(),
  // Respostas às perguntas-chave de cada etapa (playbook), guardadas por
  // chave de etapa: { "qualificado": { "qualif_situacao": "..." }, ... }.
  // Alimenta roteiro de reunião, geração de proposta e argumento de venda.
  respostasEtapas: jsonb("respostas_etapas").$type<Record<string, Record<string, string>>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const valorField = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .nullable()
  .optional();

const numericSaasField = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .optional();

export const ETAPAS_SAAS = [
  "lead_qualificado",
  "demo_agendada",
  "trial_ativo",
  "proposta_enviada",
  "fechamento",
  "onboarding",
  "expansao",
] as const;

export type EtapaSaas = (typeof ETAPAS_SAAS)[number];

export const insertDealSchema = createInsertSchema(dealsTable, {
  valor: valorField,
  probabilidade: z.number().int().min(0).max(100).optional(),
  dataFechamentoPrevista: z.coerce.date().optional(),
  dataFechamento: z.coerce.date().optional(),
  mrr: numericSaasField,
  arr: numericSaasField,
  seats: z.number().int().min(0).optional(),
  probChurn: z.number().int().min(0).max(100).optional(),
  dataRenovacao: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, etapaAlteradaEm: true });

export const updateDealSchema = createSelectSchema(dealsTable, {
  valor: valorField,
  probabilidade: z.number().int().min(0).max(100).optional(),
  dataFechamentoPrevista: z.coerce.date().optional(),
  dataFechamento: z.coerce.date().optional(),
  mrr: numericSaasField,
  arr: numericSaasField,
  seats: z.number().int().min(0).optional(),
  probChurn: z.number().int().min(0).max(100).optional(),
  dataRenovacao: z.coerce.date().optional(),
  tipoFechamento: z.enum(["pedido", "contrato", "pedido_e_contrato"]).optional(),
  cobrancaTipo: z.enum(["automatico", "manual"]).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true, etapaAlteradaEm: true })
  .partial();

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type UpdateDeal = z.infer<typeof updateDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
