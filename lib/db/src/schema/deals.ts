import { pgTable, text, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
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
  etapa: dealEtapaEnum("etapa").notNull().default("novo"),
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
  aquecimentoTipo: text("aquecimento_tipo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const valorField = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
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
}).omit({ id: true, createdAt: true, updatedAt: true });

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
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type UpdateDeal = z.infer<typeof updateDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
