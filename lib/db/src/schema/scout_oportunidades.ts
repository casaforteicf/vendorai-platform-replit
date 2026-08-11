import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { scoutRegrasTable } from "./scout_regras";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

// status: pendente | enviado | respondeu | converteu | ignorado | aguardando_etapa | adiado | pendente_revisao_bot
export const SCOUT_OPORTUNIDADE_STATUS = [
  "pendente",
  "enviado",
  "respondeu",
  "converteu",
  "ignorado",
  "aguardando_etapa",
  "adiado",
  "pendente_revisao_bot",
  "pendente_aprovacao",
  "aprovado",
  "em_negociacao",
] as const;

export const scoutOportunidadesTable = pgTable("scout_oportunidades", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  regraId: text("regra_id")
    .notNull()
    .references(() => scoutRegrasTable.id, { onDelete: "restrict" }),
  tipo:            varchar("tipo",             { length: 50  }),
  descricao:       text("descricao"),
  valorEstimado:   numeric("valor_estimado",   { precision: 10, scale: 2 }),
  status:          varchar("status",           { length: 20  }).default("pendente"),
  canal:           varchar("canal",            { length: 20  }),
  mensagemEnviada: text("mensagem_enviada"),
  respondeu:       boolean("respondeu").default(false),
  converteu:       boolean("converteu").default(false),
  enviadoEm:       timestamp("enviado_em"),
  // Usado apenas por tipo "sequencia_produto": quando status="adiado", a oportunidade
  // só volta a ser considerada pelo Revenue Scout após este instante (timing recalculado
  // a partir da etapa relatada pelo cliente), evitando reenvio por calendário fixo.
  proximaTentativaEm: timestamp("proxima_tentativa_em"),
  // Snapshot da etapa relatada pelo cliente no momento em que a oportunidade foi adiada.
  etapaRelatada:   text("etapa_relatada"),
  // Preenchido automaticamente quando um deal do mesmo lead vira "ganho" dentro
  // da janela de correlação (ver reconcileScoutOnDealWon) — fecha o placar do
  // Scout sem depender de conversão manual via /converter.
  // Vincula a oportunidade a um orçamento específico — usado por
  // "orcamento_parado", pra saber exatamente qual proposta está travada.
  propostaId:      text("proposta_id"),
  dealId:          text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  // Contador de sinais de bot detectados em respostas do lead nesta oportunidade.
  // Quando atingir o limite (default: 3), muda o status para "pendente_revisao_bot".
  sinaisBot:       integer("sinais_bot").notNull().default(0),
  // Score de prioridade 0-100: combina tipo, tempo de atraso e valor estimado.
  // Oportunidades com score maior são processadas primeiro.
  scoreOportunidade: numeric("score_oportunidade", { precision: 5, scale: 2 }),
  // Seguros Corporativos: oportunidade sempre vinculada a conta + produto/apólice.
  insurancePositionId: text("insurance_position_id"),
  renewalWindow: text("renewal_window"),
  humanRequired: boolean("human_required").notNull().default(false),
  blocked: boolean("blocked").notNull().default(false),
  explanation: jsonb("explanation").$type<{
    facts?: Record<string, unknown>;
    inference?: Record<string, unknown>;
    autonomy?: Record<string, unknown>;
  }>(),
  // Pipeline exclusivo do Revenue Scout. Nao cria nem mistura registros em deals.
  pipelineStage: varchar("pipeline_stage", { length: 30 }).notNull().default("identificada"),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  approvedBy: text("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export const insertScoutOportunidadeSchema = createInsertSchema(scoutOportunidadesTable, {
  valorEstimado:     z.coerce.number().nonnegative().optional(),
  scoreOportunidade: z.coerce.number().min(0).max(100).optional(),
  status:            z.enum(SCOUT_OPORTUNIDADE_STATUS).optional(),
}).omit({ id: true, createdAt: true });

export const updateScoutOportunidadeSchema = createSelectSchema(scoutOportunidadesTable, {
  valorEstimado:     z.coerce.number().nonnegative().optional(),
  scoreOportunidade: z.coerce.number().min(0).max(100).optional(),
  status:            z.enum(SCOUT_OPORTUNIDADE_STATUS).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertScoutOportunidade = z.infer<typeof insertScoutOportunidadeSchema>;
export type UpdateScoutOportunidade = z.infer<typeof updateScoutOportunidadeSchema>;
export type ScoutOportunidade       = typeof scoutOportunidadesTable.$inferSelect;
