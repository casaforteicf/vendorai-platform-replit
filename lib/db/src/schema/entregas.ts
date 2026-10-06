import { pgTable, text, timestamp, pgEnum, jsonb, boolean, integer } from "drizzle-orm/pg-core";
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

/**
 * Snapshot do item colocado em um lote de entrega.
 * `propostaItemIndex` mantém o vínculo determinístico com o item do pedido
 * (a proposta aceita continua sendo a fonte do pedido no CRM atual).
 */
export const entregaItemSchema = z.object({
  nome: z.string().min(1),
  quantidade: z.number().positive(),
  sku: z.string().optional(),
  produtoId: z.string().optional(),
  unidade: z.string().optional(),
  propostaItemIndex: z.number().int().nonnegative().optional(),
  quantidadePedido: z.number().positive().optional(),
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
  loteNumero: integer("lote_numero"),
  dataLiberacaoPrevista: timestamp("data_liberacao_prevista"),
  dataLiberacaoEfetiva: timestamp("data_liberacao_efetiva"),
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
  dataLiberacaoPrevista: z.coerce.date().optional(),
  dataLiberacaoEfetiva: z.coerce.date().optional(),
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
  dataLiberacaoPrevista: z.coerce.date().optional(),
  dataLiberacaoEfetiva: z.coerce.date().optional(),
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

/**
 * Card operacional permanente. O card representa PROCESSO, não cliente nem
 * nova venda: um mesmo deal/pedido pode ter card-pai + vários cards-filhos.
 */
export const workCardsTable = pgTable("work_cards", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  codigo: text("codigo")
    .notNull()
    .$defaultFn(() => `OP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`),
  pipeline: text("pipeline").notNull().default("execucao"),
  tipo: text("tipo").notNull().default("pedido"),
  etapa: text("etapa").notNull().default("pedido_confirmado"),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  prioridade: text("prioridade").notNull().default("normal"),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  propostaId: text("proposta_id").references(() => propostasTable.id, { onDelete: "set null" }),
  entregaId: text("entrega_id").references(() => entregasTable.id, { onDelete: "set null" }),
  parentCardId: text("parent_card_id"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  dataInicioPrevista: timestamp("data_inicio_prevista"),
  dataInicioEfetiva: timestamp("data_inicio_efetiva"),
  dataFimPrevista: timestamp("data_fim_prevista"),
  dataFimEfetiva: timestamp("data_fim_efetiva"),
  // Hash SHA-256 do link público permanente do processo. O token em claro fica
  // somente no metadata para reenvio pelo time autorizado; lookup público usa o hash.
  publicAccessTokenHash: text("public_access_token_hash"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workCardAttachmentsTable = pgTable("work_card_attachments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  workCardId: text("work_card_id")
    .notNull()
    .references(() => workCardsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  criadoPor: text("criado_por").references(() => usersTable.id, { onDelete: "set null" }),
  origem: text("origem").notNull().default("app"),
  nome: text("nome").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type"),
  tamanho: integer("tamanho"),
  descricao: text("descricao"),
  transcricao: text("transcricao"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkCardSchema = createInsertSchema(workCardsTable, {
  dataInicioPrevista: z.coerce.date().optional(),
  dataInicioEfetiva: z.coerce.date().optional(),
  dataFimPrevista: z.coerce.date().optional(),
  dataFimEfetiva: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateWorkCardSchema = createSelectSchema(workCardsTable, {
  dataInicioPrevista: z.coerce.date().optional(),
  dataInicioEfetiva: z.coerce.date().optional(),
  dataFimPrevista: z.coerce.date().optional(),
  dataFimEfetiva: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
  .omit({ id: true, tenantId: true, publicAccessTokenHash: true, createdAt: true, updatedAt: true })
  .partial();

export const insertWorkCardAttachmentSchema = createInsertSchema(workCardAttachmentsTable, {
  metadata: z.record(z.string(), z.unknown()).optional(),
}).omit({ id: true, createdAt: true });

export type InsertEntrega = z.infer<typeof insertEntregaSchema>;
export type UpdateEntrega = z.infer<typeof updateEntregaSchema>;
export type Entrega = typeof entregasTable.$inferSelect;
export type WorkCard = typeof workCardsTable.$inferSelect;
export type InsertWorkCard = z.infer<typeof insertWorkCardSchema>;
export type UpdateWorkCard = z.infer<typeof updateWorkCardSchema>;
export type WorkCardAttachment = typeof workCardAttachmentsTable.$inferSelect;
