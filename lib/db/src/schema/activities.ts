import { pgTable, text, timestamp, pgEnum, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";
import { agendasTable } from "./agendas";

export const activityTipoEnum = pgEnum("activity_tipo", [
  "ligacao",
  "whatsapp",
  "email",
  "visita",
  "tarefa",
  "reuniao",
  "escalacao_humano",
  "handoff_agente",
  "feedback_entrega",
  "assistencia",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "pendente",
  "concluida",
  "cancelada",
  "planejado",
]);

export const anexoCategoriaEnum = pgEnum("anexo_categoria", [
  "projeto",
  "imagem",
  "documento",
  "outras_informacoes",
]);

export const activitiesTable = pgTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  tipo: activityTipoEnum("tipo").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  status: activityStatusEnum("status").notNull().default("pendente"),
  dataVencimento: timestamp("data_vencimento"),
  concluidaEm: timestamp("concluida_em"),
  resultadoExecucao: text("resultado_execucao"),
  objetivo: text("objetivo"),
  resultadoEsperado: text("resultado_esperado"),
  prioridade: text("prioridade").notNull().default("normal"),
  estadoExecucao: text("estado_execucao").notNull().default("criada"),
  categoriaExecucao: text("categoria_execucao"),
  origem: text("origem").notNull().default("manual"),
  origemEtapaId: text("origem_etapa_id"),
  origemEtapaKey: text("origem_etapa_key"),
  origemTemplateKey: text("origem_template_key"),
  bloqueiaAvanco: boolean("bloqueia_avanco").notNull().default(false),
  agenteResponsavelKey: text("agente_responsavel_key"),
  proximaAcaoTexto: text("proxima_acao_texto"),
  atividadePaiId: text("atividade_pai_id"),
  // Vincula a atividade diretamente ao processo operacional (ex.: assistência).
  workCardId: text("work_card_id"),
  // Snapshot imutável do formulário/perguntas vigente quando a atividade foi criada.
  formularioSnapshot: jsonb("formulario_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  // Respostas estruturadas com histórico de autor/origem/alterações.
  formularioRespostas: jsonb("formulario_respostas").$type<Record<string, unknown>>().notNull().default({}),
  responsavelId: text("responsavel_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  // Reunião online
  agendaId: text("agenda_id").references(() => agendasTable.id, { onDelete: "set null" }),
  dataHoraInicio: timestamp("data_hora_inicio"),
  dataHoraFim: timestamp("data_hora_fim"),
  gerarMeet: boolean("gerar_meet").default(false),
  googleEventId: text("google_event_id"),
  meetLink: text("meet_link"),
  // SPIN Selling briefing gerado automaticamente ao agendar reunião
  spinBriefing: text("spin_briefing"),
  spinGeneratedAt: timestamp("spin_generated_at"),
  // Anexo
  anexoNome: text("anexo_nome"),
  anexoUrl: text("anexo_url"),
  anexoMimeType: text("anexo_mime_type"),
  anexoTamanho: integer("anexo_tamanho"),
  anexoCategoria: anexoCategoriaEnum("anexo_categoria"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activitiesTable, {
  dataVencimento: z.coerce.date().optional(),
  concluidaEm: z.coerce.date().optional(),
  dataHoraInicio: z.coerce.date().optional(),
  dataHoraFim: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, googleEventId: true, meetLink: true });

export const updateActivitySchema = createSelectSchema(activitiesTable, {
  dataVencimento: z.coerce.date().optional(),
  concluidaEm: z.coerce.date().optional(),
  dataHoraInicio: z.coerce.date().optional(),
  dataHoraFim: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
