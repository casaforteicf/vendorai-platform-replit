import { pgTable, text, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const ruleTriggerEnum = pgEnum("rule_trigger", [
  "lead_criado",
  "churn_risk_alto",
  "proposta_enviada",
  "agendamento_proximo",
  "sem_atividade_x_dias",
  "deal_ganho",
  "deal_perdido",
]);

export const ruleAcaoEnum = pgEnum("rule_acao", [
  "criar_agent_task",
  "criar_campanha",
  "notificar_usuario",
  "criar_atividade",
]);

type Condicao = { campo: string; operador: string; valor: unknown };

export const jarvisPlaybookMetadataSchema = z.object({
  approved: z.boolean(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.string().min(1).optional(),
  autonomyLevel: z.enum(["manual", "assistido", "autonomo"]).optional(),
  expectedOutcome: z.string().min(1).max(1000).optional(),
  stopConditions: z.array(z.string().min(1)).max(20).optional(),
});

export type JarvisPlaybookMetadata = z.infer<typeof jarvisPlaybookMetadataSchema>;
export type RuleActionPayload = Record<string, unknown> & {
  jarvisPlaybook?: JarvisPlaybookMetadata;
};

export const rulesTable = pgTable("rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  trigger: ruleTriggerEnum("trigger").notNull(),
  condicoes: jsonb("condicoes").$type<Condicao[]>().default([]),
  acao: ruleAcaoEnum("acao").notNull(),
  acaoPayload: jsonb("acao_payload").$type<RuleActionPayload>().default({}),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const condicaoSchema = z.object({
  campo: z.string(),
  operador: z.string(),
  valor: z.unknown(),
});

export const insertRuleSchema = createInsertSchema(rulesTable, {
  nome: z.string().min(1),
  condicoes: z.array(condicaoSchema).optional(),
  acaoPayload: z.record(z.string(), z.unknown()).optional(),
  ativo: z.boolean().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateRuleSchema = createSelectSchema(rulesTable, {
  nome: z.string().min(1).optional(),
  condicoes: z.array(condicaoSchema).optional(),
  acaoPayload: z.record(z.string(), z.unknown()).optional(),
  ativo: z.boolean().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();