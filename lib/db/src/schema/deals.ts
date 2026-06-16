import { pgTable, text, timestamp, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { funisTable } from "./funis";
import { usersTable } from "./users";

export const dealEtapaEnum = pgEnum("deal_etapa", [
  "novo",
  "qualificado",
  "proposta",
  "negociacao",
  "ganho",
  "perdido",
]);

export const dealTipoFechamentoEnum = pgEnum("deal_tipo_fechamento", [
  "pedido",
  "contrato",
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
  motivoPerda: text("motivo_perda"),
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
  mrr: numericSaasField,
  arr: numericSaasField,
  seats: z.number().int().min(0).optional(),
  probChurn: z.number().int().min(0).max(100).optional(),
  dataRenovacao: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type UpdateDeal = z.infer<typeof updateDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
