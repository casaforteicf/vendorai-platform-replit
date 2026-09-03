// Etapas do pipeline de negócios, configuráveis por tenant. As 11
// etapas do sistema (antigo enum de deals.etapa) existem como linhas
// isSystem=true — protegidas contra exclusão/troca de key (automação
// de contrato/cobrança em vários pontos do backend depende do valor
// exato), mas label/cor/SLA são editáveis pelo admin. Etapas novas
// (isSystem=false) são só organizacionais, sem automação nenhuma
// amarrada — o admin do tenant pode criar quantas quiser.
import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  color: text("color"),
  bg: text("bg"),
  ordem: integer("ordem").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  // Minutos que um deal pode ficar nesta etapa antes do card ficar
  // vermelho no Kanban. Null = sem SLA (nunca fica vermelho).
  slaMinutos: integer("sla_minutos"),
  // Campo legado: IDs de pessoas elegíveis para receber um negócio.
  // Mantido apenas por compatibilidade; a responsabilidade da etapa é
  // definida por função em `responsaveisFuncoes`, nunca por pessoa.
  elegiveisUserIds: text("elegiveis_user_ids").array(),
  // Funções responsáveis por executar/acessar a etapa.
  // Formato: `builtin:vendedor` ou `custom:<tenant_user_functions.id>`.
  // Null/vazio = etapa sem restrição por função (compatibilidade).
  responsaveisFuncoes: text("responsaveis_funcoes").array().notNull().default([]),
  // Perguntas-chave desta etapa (playbook) — aparecem no topo da Central
  // de Trabalho enquanto o negócio está nesta etapa, e alimentam roteiro
  // de reunião / geração de proposta / argumento de venda.
  perguntas: jsonb("perguntas").$type<{ id: string; texto: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const updatePipelineStageSchema = createSelectSchema(pipelineStagesTable)
  .omit({ id: true, tenantId: true, key: true, isSystem: true, createdAt: true, updatedAt: true })
  .partial();

export type PipelineStage = typeof pipelineStagesTable.$inferSelect;
export type NewPipelineStage = typeof pipelineStagesTable.$inferInsert;

// As 11 etapas do sistema (mesmos valores do antigo dealEtapaEnum) —
// usado pra semear tenants que ainda não têm nenhuma etapa configurada.
// Mesmas labels/cores que já existiam hardcoded em Deals.tsx (ETAPAS).
// `perguntas` são o playbook padrão de cada etapa comercial — aparecem
// no topo da Central de Trabalho, e o admin pode editar/adicionar/remover
// livremente depois (ficam guardadas na própria linha da etapa, então
// sobrevivem a renomear/reordenar a pipeline).
export const SYSTEM_PIPELINE_STAGES: Array<{ key: string; label: string; color: string; bg: string; ordem: number; perguntas?: { id: string; texto: string }[] }> = [
  { key: "em_aquecimento",      label: "Em Aquecimento", color: "text-orange-600",  bg: "bg-orange-100",  ordem: 0 },
  {
    key: "novo", label: "Novo", color: "text-slate-600", bg: "bg-slate-100", ordem: 1,
    perguntas: [
      { id: "novo_pesquisa", texto: "O que já se sabe sobre este lead antes do contato?" },
      { id: "novo_decisor", texto: "Já tem acesso confirmado ao decisor?" },
      { id: "novo_proximo_passo", texto: "Qual foi o resultado do primeiro contato e o próximo passo combinado?" },
    ],
  },
  {
    key: "qualificado", label: "Qualificado", color: "text-blue-600", bg: "bg-blue-100", ordem: 2,
    perguntas: [
      { id: "qualif_situacao", texto: "Como funciona hoje o processo/atendimento do cliente (situação atual)?" },
      { id: "qualif_problema", texto: "Qual é a maior dificuldade ou dor que ele enfrenta?" },
      { id: "qualif_implicacao", texto: "Qual o impacto (tempo, custo, receita) de não resolver isso?" },
      { id: "qualif_necessidade", texto: "O que mudaria pra ele se esse problema fosse resolvido?" },
    ],
  },
  {
    key: "proposta", label: "Orçamento", color: "text-violet-600", bg: "bg-violet-100", ordem: 3,
    perguntas: [
      { id: "prop_demonstrado", texto: "O que foi demonstrado/apresentado ao cliente?" },
      { id: "prop_valor_percebido", texto: "Qual valor/benefício ficou claro pra ele?" },
      { id: "prop_feedback", texto: "Qual foi o feedback recebido sobre a proposta?" },
    ],
  },
  {
    key: "negociacao", label: "Negociação", color: "text-amber-600", bg: "bg-amber-100", ordem: 4,
    perguntas: [
      { id: "neg_objecoes", texto: "Quais objeções foram levantadas e como foram tratadas?" },
      { id: "neg_condicoes", texto: "Quais condições estão em discussão (desconto, prazo, forma de pagamento)?" },
      { id: "neg_decisao", texto: "O que falta pra fechar — aprovação, decisão, ajuste de valor?" },
    ],
  },
  {
    key: "conferencia_estoque", label: "Conf. Estoque", color: "text-indigo-600", bg: "bg-indigo-100", ordem: 5,
    perguntas: [
      { id: "conf_estoque", texto: "Estoque disponível confirmado pra este pedido?" },
      { id: "conf_prazo", texto: "Prazo de entrega confirmado com o cliente?" },
    ],
  },
  { key: "ganho",                label: "Ganho",          color: "text-emerald-600", bg: "bg-emerald-100", ordem: 6 },
  { key: "em_execucao",         label: "Em Execução",    color: "text-cyan-600",    bg: "bg-cyan-100",    ordem: 7 },
  { key: "entregue",             label: "Entregue",       color: "text-teal-600",    bg: "bg-teal-100",    ordem: 8 },
  { key: "perdido",              label: "Perdido",        color: "text-red-600",     bg: "bg-red-100",     ordem: 9 },
  { key: "parceiro",             label: "Parceiros",      color: "text-purple-600",  bg: "bg-purple-100",  ordem: 10 },
];
