import { pgTable, text, timestamp, numeric, pgEnum, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";

export const propostaStatusEnum = pgEnum("proposta_status", [
  "rascunho",
  "enviada",
  "pendente",
  "aceita",
  "rejeitada",
  "expirada",
]);

export const formaPagamentoPropostaEnum = pgEnum("forma_pagamento_proposta", [
  "pix",
  "boleto",
  "cartao_credito",
  "cartao_debito",
  "transferencia",
  "dinheiro",
  "a_combinar",
]);

export const propostaItemExecucaoStatusSchema = z.enum([
  "pendente",
  "em_execucao",
  "concluida",
]);

export type PropostaItemExecucaoStatus = z.infer<typeof propostaItemExecucaoStatusSchema>;

// Dados documentais opcionais: vinculados ao item e preservados na revisão.
// A IA pode sugerir correções, mas não pode criar valores contratuais sem fonte.
export const propostaItemContratualSchema = z.object({
  classificacao: z.enum(["incluido", "excluido", "opcional", "condicionado"]).optional(),
  categoria: z.enum(["material", "servico", "composicao"]).optional(),
  descricaoTecnica: z.string().max(12000).optional(),
  fabricante: z.string().max(300).optional(),
  marca: z.string().max(300).optional(),
  modelo: z.string().max(300).optional(),
  especificacao: z.string().max(5000).optional(),
  localAplicacao: z.string().max(1000).optional(),
  ambienteId: z.string().optional(),
  arqdorProjectId: z.string().optional(),
  arqdorSpecObjectId: z.string().optional(),
  limiteMaterialUnitario: z.number().nonnegative().optional(),
  limiteMaterialUnidade: z.string().max(30).optional(),
  exigeValidacaoTecnica: z.boolean().optional(),
  observacoesMemorial: z.string().max(5000).optional(),
  // Proveniência obrigatória apenas quando um campo é declarado como verificado.
  fonte: z.object({
    tipo: z.enum(["projeto_arqdor", "especificacao_arqdor", "orcamento", "catalogo", "documento_assinado", "manual"]),
    id: z.string().min(1),
    revisao: z.string().optional(),
    consultadoEm: z.string().datetime().optional(),
    aprovado: z.boolean().default(false),
  }).optional(),
}).superRefine((item, ctx) => {
  if (item.fonte?.aprovado && !item.fonte.revisao && item.fonte.tipo === "documento_assinado") {
    ctx.addIssue({ code: "custom", path: ["fonte", "revisao"], message: "Documento assinado exige revisão de origem." });
  }
});

export const propostaItemSchema = z.object({
  nome: z.string().min(1),
  // Metadados opcionais, sem alterar quantidade, preço nem saldo comercial.
  contratual: propostaItemContratualSchema.optional(),
  quantidade: z.number().positive(),
  valorUnitario: z.number().nonnegative(),
  sku: z.string().optional(),
  descricao: z.string().optional(),
  unidade: z.string().optional(),
  // Grupo operacional do orçamento. Vários produtos/composições podem pertencer
  // à mesma etapa e a sequência é controlada por etapaOrdem.
  etapaId: z.string().optional(),
  etapaNome: z.string().optional(),
  etapaOrdem: z.number().int().positive().optional(),
  // Ordem operacional do item depois que o orçamento é vendido.
  // O orçamento comercial continua sendo o snapshot original; a execução
  // avança item a item sem apagar histórico.
  ordemExecucao: z.number().int().positive().optional(),
  statusExecucao: propostaItemExecucaoStatusSchema.optional(),
  iniciadoEm: z.string().datetime().optional(),
  executadoEm: z.string().datetime().optional(),
  // Fase executiva opcional dentro da etapa. Permite medir/cobrar por fase
  // sem duplicar a etapa comercial (ex.: Estrutura ICF > 1º pavimento).
  faseId: z.string().optional(),
  faseNome: z.string().optional(),
  faseOrdem: z.number().int().positive().optional(),
  // Referência opcional à composição de obra que originou o item.
  // O preço do orçamento é um snapshot e não muda quando a composição muda depois.
  composicaoId: z.string().optional(),
  // Referência opcional a produtos_catalogo.id — usada pelo Revenue Scout
  // (regra "sequencia_produto") para detectar compra de um produto específico.
  produtoId: z.string().optional(),
  // Snapshot comercial do item no momento em que entrou no orçamento.
  // Mantém a versão histórica mesmo se catálogo, fornecedor ou preço mudarem depois.
  sourceSnapshot: z.object({
    capturedAt: z.string(),
    sourceType: z.enum(["catalog_product", "composition", "manual"]),
    sourceId: z.string().optional(),
    nome: z.string().optional(),
    sku: z.string().optional(),
    descricao: z.string().optional(),
    unidade: z.string().optional(),
    marca: z.string().optional(),
    fornecedor: z.string().optional(),
    imagemUrl: z.string().optional(),
    imagens: z.array(z.string()).optional(),
    precoCatalogo: z.number().optional(),
    precoAplicado: z.number().optional(),
    prazoEntregaDias: z.number().int().optional(),
    pricingConfig: z.record(z.string(), z.unknown()).optional(),
    deliveryConfig: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

export type PropostaItem = z.infer<typeof propostaItemSchema>;

export const propostaApresentacaoModoSchema = z.enum([
  "completo",
  "resumo_etapa",
  "preco_medio",
]);

export type PropostaApresentacaoModo = z.infer<typeof propostaApresentacaoModoSchema>;

export const propostaTipoDependenciaSchema = z.enum(["FS", "SS", "FF", "SF"]);
export type PropostaTipoDependencia = z.infer<typeof propostaTipoDependenciaSchema>;

export const propostaCronogramaFaseSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  ordem: z.number().int().positive(),
  duracaoDias: z.number().int().positive().optional(),
  percentualEtapa: z.number().min(0).max(100).optional(),
  percentualFisico: z.number().min(0).max(100).optional(),
  inicioPrevisto: z.string().optional(),
  fimPrevisto: z.string().optional(),
  dependeDeFaseId: z.string().optional(),
  tipoDependencia: propostaTipoDependenciaSchema.optional(),
  defasagemDias: z.number().int().optional(),
  observacao: z.string().optional(),
});

export type PropostaCronogramaFase = z.infer<typeof propostaCronogramaFaseSchema>;

export const propostaCronogramaEtapaSchema = z.object({
  duracaoDias: z.number().int().positive().optional(),
  percentualFisico: z.number().min(0).max(100).optional(),
  inicioPrevisto: z.string().optional(),
  fimPrevisto: z.string().optional(),
  dependeDeEtapaId: z.string().optional(),
  tipoDependencia: propostaTipoDependenciaSchema.optional(),
  defasagemDias: z.number().int().optional(),
  inicioAutomatico: z.boolean().optional(),
  fases: z.array(propostaCronogramaFaseSchema).default([]),
  observacao: z.string().optional(),
  marcoPagamento: z.string().optional(),
  // Configuração comercial definida no orçamento e apenas apresentada ao cliente.
  // Esquadrias usam valor global previsto; revestimentos usam referência em R$/m².
  // Os campos ficam no orçamento para evitar definições paralelas na proposta.
  valorGlobalPrevisto: z.number().nonnegative().optional(),
  valorReferenciaM2: z.number().nonnegative().optional(),
  // Mantido por compatibilidade com orçamentos anteriores; a interface nova
  // deriva a apresentação diretamente da definição comercial cadastrada.
  mostrarOrcamentoPrevisto: z.boolean().optional(),
  reajusteSeAlteracao: z.boolean().optional(),
});

export type PropostaCronogramaEtapa = z.infer<typeof propostaCronogramaEtapaSchema>;

export const propostaApresentacaoFormatoSchema = z.enum(["site_interativo", "documento", "hibrido"]);
export type PropostaApresentacaoFormato = z.infer<typeof propostaApresentacaoFormatoSchema>;

export const propostaEstiloCasaSchema = z.enum([
  "moderna",
  "contemporanea",
  "minimalista",
  "classica",
  "industrial",
]);
export type PropostaEstiloCasa = z.infer<typeof propostaEstiloCasaSchema>;

export const propostaPadraoCasaSchema = z.enum(["medio", "alto_padrao", "luxo"]);
export type PropostaPadraoCasa = z.infer<typeof propostaPadraoCasaSchema>;

export const propostaTipoCasaSchema = z.enum(["terrea", "sobrado"]);
export type PropostaTipoCasa = z.infer<typeof propostaTipoCasaSchema>;

export const propostaApresentacaoSchema = z.object({
  formato: propostaApresentacaoFormatoSchema.default("site_interativo"),
  estiloCasa: propostaEstiloCasaSchema.default("contemporanea"),
  padraoCasa: propostaPadraoCasaSchema.default("alto_padrao"),
  tipoCasa: propostaTipoCasaSchema.default("sobrado"),
  elementosVisuais: z.array(z.string().min(1)).default([]),
  imagemCapa: z.string().optional(),
  modoPadrao: propostaApresentacaoModoSchema.default("completo"),
  etapas: z.record(z.string(), propostaApresentacaoModoSchema).default({}),
  mostrarTotalGeral: z.boolean().default(true),
  mostrarDetalhamentoTecnico: z.boolean().default(true),
  detalhamentoTecnicoEtapas: z.record(z.string(), z.boolean()).default({}),
  previsaoInicio: z.string().optional(),
  cronogramaEtapas: z.record(z.string(), propostaCronogramaEtapaSchema).default({}),
  // Imagem representativa/ilustrativa vinculada à etapa do orçamento.
  // A imagem pode ser gerada por IA e é reutilizada na proposta/PDF.
  imagensEtapas: z.record(z.string(), z.string()).default({}),
  mostrarCronogramaExecucao: z.boolean().default(true),
  mostrarFisicoFinanceiro: z.boolean().default(true),
  entradaPercentual: z.number().min(0).max(100).default(0),
  amortizacaoEntradaPercentual: z.number().min(0).max(100).default(0),
  mostrarAmortizacaoEntrada: z.boolean().default(true),
  mostrarPortalCliente: z.boolean().default(true),
  areaTotalConstruida: z.number().positive().optional(),
  // Exclusões comerciais editáveis pelo tenant. Cada linha representa um item
  // explicitamente fora do valor global e deve aparecer na proposta.
  itensNaoInclusos: z.array(z.string().min(1)).default([]),
  descricaoProjeto: z.string().max(5000).default(""),
  premissasObra: z.array(z.string().min(1)).default([]),
  memorialDescritivo: z.string().max(12000).default(""),
  politicaReajuste: z.string().max(3000).default(""),
  garantiasContratuais: z.string().max(5000).default(""),
  condicoesPagamentoDetalhadas: z.string().max(5000).default(""),
  // Contexto do validador: define quais regras fazem sentido para este orçamento.
  // Evita aplicar exigências de obra/ICF em mobiliário, marcenaria, acabamentos etc.
  validatorContext: z.object({
    scopeTypes: z.array(z.string().min(1)).default([]),
    constructionSystem: z.string().optional(),
  }).optional(),
  // Snapshot estrutural do orçamento. Fica dentro do JSON existente para não
  // depender de uma nova coluna/migração e acompanha naturalmente cada revisão.
  sourceSnapshot: z.object({
    schemaVersion: z.number().int().positive().default(1),
    capturedAt: z.string(),
    immutableForVersion: z.boolean().default(true),
    origin: z.enum(["manual", "catalog", "composition", "revision", "imported"]),
    baseBudgetId: z.string().optional(),
    baseBudgetNumber: z.string().optional(),
    revisionLabel: z.string().optional(),
    client: z.record(z.string(), z.unknown()).optional(),
    company: z.record(z.string(), z.unknown()).optional(),
    catalogItemIds: z.array(z.string()).default([]),
    compositionIds: z.array(z.string()).default([]),
    mediaUrls: z.array(z.string()).default([]),
    pending: z.array(z.object({
      code: z.string(),
      severity: z.enum(["blocker", "warning"]),
      field: z.string().optional(),
      message: z.string(),
    })).default([]),
  }).optional(),
});

export type PropostaApresentacao = z.infer<typeof propostaApresentacaoSchema>;

const DEFAULT_PROPOSTA_APRESENTACAO: PropostaApresentacao = {
  formato: "site_interativo",
  estiloCasa: "contemporanea",
  padraoCasa: "alto_padrao",
  tipoCasa: "sobrado",
  elementosVisuais: [],
  modoPadrao: "completo",
  etapas: {},
  mostrarTotalGeral: true,
  mostrarDetalhamentoTecnico: true,
  detalhamentoTecnicoEtapas: {},
  cronogramaEtapas: {},
  imagensEtapas: {},
  mostrarCronogramaExecucao: true,
  mostrarFisicoFinanceiro: true,
  entradaPercentual: 0,
  amortizacaoEntradaPercentual: 0,
  mostrarAmortizacaoEntrada: true,
  mostrarPortalCliente: true,
  itensNaoInclusos: [],
  descricaoProjeto: "",
  premissasObra: [],
  memorialDescritivo: "",
  politicaReajuste: "",
  garantiasContratuais: "",
  condicoesPagamentoDetalhadas: "",
};

const valorField = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .optional();

export const propostasTable = pgTable("propostas", {
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
  titulo: text("titulo").notNull(),
  itens: jsonb("itens").$type<PropostaItem[]>().notNull().default([]),
  apresentacao: jsonb("apresentacao")
    .$type<PropostaApresentacao>()
    .notNull()
    .default(DEFAULT_PROPOSTA_APRESENTACAO),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }),
  status: propostaStatusEnum("status").notNull().default("rascunho"),
  validadeAte: timestamp("validade_ate"),
  observacoes: text("observacoes"),
  formaPagamento: formaPagamentoPropostaEnum("forma_pagamento"),
  condPagamento: text("cond_pagamento"),
  prazoEntrega: text("prazo_entrega"),
  formaPagamentoMensalidade: text("forma_pagamento_mensalidade"),
  condPagamentoMensalidade: text("cond_pagamento_mensalidade"),
  numero: text("numero"),
  // Orçamento importado de outro sistema (não gerado pelo Vendor.ai) —
  // guarda o arquivo original anexado pelo usuário como referência.
  arquivoImportadoUrl: text("arquivo_importado_url"),
  arquivoImportadoNome: text("arquivo_importado_nome"),
  recorrente: boolean("recorrente").default(false),
  valorMensal: numeric("valor_mensal", { precision: 12, scale: 2 }),
  prazoContratoMeses: integer("prazo_contrato_meses"),
  numParcelas: integer("num_parcelas"),
  autoGenerated: boolean("auto_generated").default(false),
  publicToken: text("public_token").$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedVia: text("accepted_via"),
  acceptedBy: text("accepted_by"),
  acceptanceMetadata: jsonb("acceptance_metadata").$type<{
    channel: "link" | "whatsapp" | "manual";
    acceptedAt: string;
    ip?: string;
    nome?: string;
    documento?: string;
  } | null>(),
  paymentCompositions: jsonb("payment_compositions").$type<
    { forma: string; valor: string; comprovanteUrl?: string | null }[]
  >().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPropostaSchema = createInsertSchema(propostasTable, {
  itens: z.array(propostaItemSchema).optional(),
  apresentacao: propostaApresentacaoSchema.optional(),
  valorTotal: valorField,
  valorMensal: valorField,
  validadeAte: z.coerce.date().optional(),
  acceptanceMetadata: z.any().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updatePropostaSchema = createSelectSchema(propostasTable, {
  itens: z.array(propostaItemSchema).optional(),
  apresentacao: propostaApresentacaoSchema.optional(),
  valorTotal: valorField,
  valorMensal: valorField,
  validadeAte: z.coerce.date().optional(),
  acceptanceMetadata: z.any().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertProposta = z.infer<typeof insertPropostaSchema>;
export type UpdateProposta = z.infer<typeof updatePropostaSchema>;
export type Proposta = typeof propostasTable.$inferSelect;
