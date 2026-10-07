// Etapas das pipelines, configuráveis por tenant. As etapas do sistema
// existem como linhas isSystem=true — protegidas contra exclusão/troca de key,
// mas label/cor/SLA/responsabilidade são editáveis pelo admin.
import { pgTable, text, timestamp, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";

export type ConfiguracaoAcompanhamentoEtapa = {
  ativo?: boolean;
  objetivo?: string;
  modo?: "automatico" | "gerar_aprovar" | "somente_sugestao";
  canaisPermitidos?: Array<"whatsapp" | "instagram" | "messenger" | "email" | "chat" | "ligacao">;
  atrasoInicialMinutos?: number;
  intervaloMinimoMinutos?: number;
  maxTentativas?: number;
  conteudosPermitidos?: Array<"texto" | "imagem" | "video" | "audio" | "documento" | "proposta" | "case">;
  usarBeneficios?: boolean;
  usarDiferenciais?: boolean;
  usarProvas?: boolean;
  chamarHumanoEmNegociacaoSensivel?: boolean;
  pararAoResponder?: boolean;
  priorizarLacunasDaEtapa?: boolean;
  priorizarRiscoAtual?: boolean;
  instrucoes?: string;
};

export type PipelineStageActivityQuestion = {
  id: string;
  texto: string;
  tipo?: "texto" | "texto_longo" | "sim_nao" | "numero" | "data" | "opcoes";
  opcoes?: string[];
  quemResponde?: "cliente" | "usuario" | "ambos" | "automatico";
  obrigatoria?: boolean;
  visivelCliente?: boolean;
  entraRelatorio?: boolean;
  editavelDepois?: boolean;
  evidenciaExigida?: "nenhuma" | "foto" | "video" | "audio" | "documento" | "midia";
};

export type PipelineStageContentInteraction = {
  id: string;
  titulo: string;
  ativo?: boolean;
  objetivo?: string | null;
  momento: "entrada" | "percentual" | "final";
  percentualPrazo?: number | null;
  canal?: "whatsapp" | "email";
  mensagem?: string | null;
  assetIds?: string[];
  selecaoConteudo?: "fixa" | "ia_recomenda" | "ia_autonoma";
  requerAprovacao?: boolean;
  enviarUmaVez?: boolean;
  instrucoesIA?: string | null;
};

export type PipelineStageActivityTemplate = {
  id: string;
  titulo: string;
  descricao?: string | null;
  objetivo?: string | null;
  resultadoEsperado?: string | null;
  perguntas?: PipelineStageActivityQuestion[];
  tipo?: "ligacao" | "whatsapp" | "email" | "visita" | "tarefa" | "reuniao";
  categoria: "obrigatoria" | "sugerida" | "automatica";
  prazoMinutos?: number | null;
  responsavel?: "deal_owner" | "stage_agent" | "unassigned";
  prioridade?: "baixa" | "normal" | "alta" | "urgente";
  bloqueiaAvanco?: boolean;
  condicao?: "sempre" | "sem_resposta_cliente" | "sem_atividade_aberta";
};

export type PipelineStageEventTemplate = {
  id: string;
  nome: string;
  ativo?: boolean;
  gatilho: "entrada" | "atraso";
  tipo: "mensagem" | "imagem" | "documento" | "playbook" | "demanda";
  destinatario: "cliente" | "responsavel" | "ambos";
  canal: "whatsapp" | "notificacao";
  mensagem?: string | null;
  anexo?: {
    nome: string;
    url: string;
    mimeType?: string | null;
  } | null;
  demanda?: {
    titulo: string;
    descricao?: string | null;
    prazoMinutos?: number | null;
    prioridade?: "baixa" | "normal" | "alta" | "urgente";
    bloqueiaAvanco?: boolean;
  } | null;
};

export type PipelineStageAICriterion = {
  field: string;
  operator?: "exists" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  value?: unknown;
  required?: boolean;
};

export type PipelineStageAIAction =
  | "create_activity"
  | "send_message"
  | "advance_stage"
  | "change_owner"
  | "generate_proposal"
  | "schedule_meeting"
  | "create_checkout"
  | "handoff_agent"
  | "move_to_warming";

export type PipelineStageAIConfig = {
  mode: "desativada" | "assistida" | "autonoma";
  allowedActions: PipelineStageAIAction[];
  approvalRequiredActions: PipelineStageAIAction[];
  entryCriteria: PipelineStageAICriterion[];
  exitCriteria: PipelineStageAICriterion[];
  nextBestActionEnabled: boolean;
  instructions?: string | null;
};

export const DEFAULT_PIPELINE_STAGE_AI_CONFIG: PipelineStageAIConfig = {
  mode: "desativada",
  allowedActions: [],
  approvalRequiredActions: [],
  entryCriteria: [],
  exitCriteria: [],
  nextBestActionEnabled: true,
};

export type PipelineStageQuestion = {
  id: string;
  texto: string;
  obrigatoria?: boolean;
  iaPodeResponder?: boolean;
  exigeConfirmacaoHumana?: boolean;
  geraAtividade?: boolean;
  campoDestino?: string | null;
  objetivo?: string | null;
  tipo?: "texto" | "sim_nao" | "numero" | "data" | "opcoes";
  ordem?: number;
};

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  // Identifica qual pipeline esta etapa configura. `comercial` é o valor
  // legado/default para preservar todos os tenants já existentes.
  pipeline: text("pipeline").notNull().default("comercial"),
  key: text("key").notNull(),
  label: text("label").notNull(),
  color: text("color"),
  bg: text("bg"),
  ordem: integer("ordem").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  // Minutos que um item pode ficar nesta etapa antes de estourar o SLA.
  slaMinutos: integer("sla_minutos"),
  // Campo legado: IDs de pessoas elegíveis para receber um negócio.
  // Mantido apenas por compatibilidade; a responsabilidade da etapa é
  // definida por função em `responsaveisFuncoes`, nunca por pessoa.
  elegiveisUserIds: text("elegiveis_user_ids").array(),
  // Funções responsáveis por executar/acessar a etapa.
  // Formato: `builtin:vendedor` ou `custom:<tenant_user_functions.id>`.
  // Vazio = etapa sem restrição por função (compatibilidade).
  responsaveisFuncoes: text("responsaveis_funcoes").array().notNull().default([]),
  // Agente IA responsável operacional pela etapa. Usa agentKey de agent_defaults/tenant_agent_configs.
  // Null = etapa sem agente IA responsável automático.
  responsavelAgenteKey: text("responsavel_agente_key"),
  // Perguntas-chave/playbook. Hoje são usadas principalmente na pipeline comercial.
  perguntas: jsonb("perguntas").$type<PipelineStageQuestion[]>().notNull().default([]),
  acompanhamentoConfig: jsonb("acompanhamento_config").$type<ConfiguracaoAcompanhamentoEtapa>().notNull().default({}),
  aiConfig: jsonb("ai_config").$type<PipelineStageAIConfig>().notNull().default(DEFAULT_PIPELINE_STAGE_AI_CONFIG),
  // Compatibilidade com o modelo anterior de uma única atividade por etapa.
  atividadePadraoTitulo: text("atividade_padrao_titulo"),
  atividadePadraoDescricao: text("atividade_padrao_descricao"),
  atividadePadraoPrazoMinutos: integer("atividade_padrao_prazo_minutos"),
  // Modelo V2: múltiplas atividades configuráveis por etapa.
  atividadesPadrao: jsonb("atividades_padrao").$type<PipelineStageActivityTemplate[]>().notNull().default([]),
  // Conteúdos/interações vinculados à linha do tempo do SLA da etapa.
  // 0% = entrada, 1..99% = durante, 100%/final = fim do prazo.
  interacoesConteudo: jsonb("interacoes_conteudo").$type<PipelineStageContentInteraction[]>().notNull().default([]),
  // Eventos disparados pela etapa. Vazio mantém comportamento legado dos tenants existentes.
  eventos: jsonb("eventos").$type<PipelineStageEventTemplate[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pipelineStageEventRunsTable = pgTable("pipeline_stage_event_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  stageId: text("stage_id").notNull().references(() => pipelineStagesTable.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  stageKey: text("stage_key").notNull(),
  gatilho: text("gatilho").notNull(),
  status: text("status").notNull().default("executing"),
  attempts: integer("attempts").notNull().default(1),
  error: text("error"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueExecution: uniqueIndex("pipeline_stage_event_runs_unique_execution_idx").on(
    table.tenantId,
    table.stageId,
    table.eventId,
    table.entityType,
    table.entityId,
    table.stageKey,
    table.gatilho,
  ),
}));

export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const updatePipelineStageSchema = createSelectSchema(pipelineStagesTable)
  .omit({ id: true, tenantId: true, pipeline: true, key: true, isSystem: true, createdAt: true, updatedAt: true })
  .partial();

export type PipelineStage = typeof pipelineStagesTable.$inferSelect;
export type NewPipelineStage = typeof pipelineStagesTable.$inferInsert;

// Etapas comerciais oficiais (mesmos valores usados por deals.etapa).
export const SYSTEM_PIPELINE_STAGES: Array<{ key: string; label: string; color: string; bg: string; ordem: number; perguntas?: PipelineStageQuestion[] }> = [
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
  { key: "ganho",        label: "Ganho",       color: "text-emerald-600", bg: "bg-emerald-100", ordem: 6 },
  { key: "em_execucao",  label: "Em Execução", color: "text-cyan-600",    bg: "bg-cyan-100",    ordem: 7 },
  { key: "entregue",     label: "Entregue",    color: "text-teal-600",    bg: "bg-teal-100",    ordem: 8 },
  { key: "perdido",      label: "Perdido",     color: "text-red-600",     bg: "bg-red-100",     ordem: 9 },
];