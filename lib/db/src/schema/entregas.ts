import { pgTable, text, timestamp, pgEnum, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";
import { propostasTable } from "./propostas";
import { leadsTable } from "./leads";
import { usersTable } from "./users";
import { agendamentosTable } from "./agendamentos";

export const entregaModoEnum = pgEnum("entrega_modo", ["agendada", "assincrona"]);

export const entregaStatusEnum = pgEnum("entrega_status", [
  "aguardando",
  "agendada",
  "em_transito",
  "entregue",
  "cancelada",
]);

export const entregaPeriodoEnum = pgEnum("entrega_periodo", ["manha", "tarde"]);

export const entregaFeedbackStatusEnum = pgEnum("entrega_feedback_status", [
  "aguardando_resposta",
  "aguardando_motivo",
  "positivo",
  "negativo",
]);

export const entregaItemSchema = z.object({
  nome: z.string().min(1),
  quantidade: z.number().positive(),
  sku: z.string().optional(),
});

export type EntregaItem = z.infer<typeof entregaItemSchema>;

export const entregasTable = pgTable("entregas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id")
    .notNull()
    .references(() => dealsTable.id, { onDelete: "cascade" }),
  propostaId: text("proposta_id").references(() => propostasTable.id, { onDelete: "set null" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  modo: entregaModoEnum("modo").notNull().default("assincrona"),
  status: entregaStatusEnum("status").notNull().default("aguardando"),
  periodo: entregaPeriodoEnum("periodo"),
  dataPrevista: timestamp("data_prevista"),
  dataEntregue: timestamp("data_entregue"),
  agendamentoId: text("agendamento_id").references(() => agendamentosTable.id, { onDelete: "set null" }),
  enderecoEntrega: text("endereco_entrega"),
  itens: jsonb("itens").$type<EntregaItem[]>().notNull().default([]),
  observacoes: text("observacoes"),
  // ── Pós-venda: pesquisa de satisfação após entrega concluída ────────────────
  feedbackStatus: entregaFeedbackStatusEnum("feedback_status"),
  feedbackMotivo: text("feedback_motivo"),
  avaliacaoSolicitada: boolean("avaliacao_solicitada").notNull().default(false),
  feedbackRespondidoEm: timestamp("feedback_respondido_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEntregaSchema = createInsertSchema(entregasTable, {
  itens: z.array(entregaItemSchema).optional(),
  dataPrevista: z.coerce.date().optional(),
  dataEntregue: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  feedbackStatus: true,
  feedbackMotivo: true,
  avaliacaoSolicitada: true,
  feedbackRespondidoEm: true,
});

export const updateEntregaSchema = createSelectSchema(entregasTable, {
  itens: z.array(entregaItemSchema).optional(),
  dataPrevista: z.coerce.date().optional(),
  dataEntregue: z.coerce.date().optional(),
})
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
    // Pós-venda feedback fields são gerenciados internamente pelo fluxo de
    // satisfação (post-venda.ts), não editáveis via API.
    feedbackStatus: true,
    feedbackMotivo: true,
    avaliacaoSolicitada: true,
    feedbackRespondidoEm: true,
  })
  .partial();

export type InsertEntrega = z.infer<typeof insertEntregaSchema>;
export type UpdateEntrega = z.infer<typeof updateEntregaSchema>;
export type Entrega = typeof entregasTable.$inferSelect;
