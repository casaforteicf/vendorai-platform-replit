import { pgTable, text, timestamp, boolean, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { categoriasProdutoTable } from "./categorias_produto";

export const PRODUCT_TYPES = ["physical", "service", "saas_plan", "saas_addon"] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export interface ProdutoDimensoes {
  largura?: number;
  altura?: number;
  profundidade?: number;
}

export interface ProdutoEspecificacao {
  label: string;
  value: string;
}

export interface ProdutoProjectSurface {
  key: string;
  label: string;
  nodeName?: string;
  materialName?: string;
  meshCount?: number;
  detected?: boolean;
}

export interface ProdutoProjectTechnicalConfig {
  modelSurfaces?: ProdutoProjectSurface[];
  modelSurfacesDetectedAt?: string;
  textureScale?: number;
  textureRotation?: number;
  renderNotes?: string;
  projectTags?: string[];
  [key: string]: unknown;
}

export interface ProdutoInteligenciaComercial {
  caracteristicas?: string[];
  diferenciais?: string[];
  beneficios?: string[];
  doresAtendidas?: string[];
  casosUso?: string[];
  personas?: string[];
  objecoes?: Array<{
    objecao: string;
    resposta?: string;
    idsProvas?: string[];
  }>;
  idsProvas?: string[];
  idsProdutosComplementares?: string[];
  afirmacoesPermitidas?: string[];
  afirmacoesProibidas?: string[];
  notasComerciais?: string[];
  duvidasFrequentes?: string[];
  garantia?: string | null;
  instalacaoUso?: string | null;
  entregaPrazo?: string | null;
  orientacoesIa?: string[];
  aprovadoEm?: string | null;
  aprovadoPor?: string | null;
  origem?: "manual" | "sugerido_ia" | "importado" | "misto";
  [key: string]: unknown;
}

// Compatibilidade veicular (Complemento Praça.ai — filtro "selecione seu
// carro" tipo Tuning Parts). anoFim vazio/null = "até hoje" (ano corrente).
export interface ProdutoCompatibilidadeVeicular {
  marca: string;
  modelo: string;
  anoInicio: number;
  anoFim?: number | null;
}

export type ProdutoPricingMode = "cost_plus" | "sale_minus_expenses";
export type ProdutoSaleMode = "direct_purchase" | "subscription" | "quote" | "assisted_sale";

export interface ProdutoPricingConfig {
  mode?: ProdutoPricingMode;
  saleMode?: ProdutoSaleMode;
  salePrice?: number | null;
  minimumPrice?: number | null;
  taxPercent?: number | null;
  otherCostPercent?: number | null;
  otherCostFixed?: number | null;
  cashPrice?: number | null;
  installmentTotalPrice?: number | null;
  maxInstallments?: number | null;
  cashFinancialCostPercent?: number | null;
  installmentFinancialCostPercent?: number | null;
  priceValidUntil?: string | null;
}

export type ProdutoDeliveryCoverageType =
  | "all_brazil"
  | "by_regions"
  | "pickup_only"
  | "no_delivery";

export type ProdutoDeliveryAvailability =
  | "delivery"
  | "pickup_only"
  | "unavailable"
  | "quote";

export type ProdutoDeliveryFeeType =
  | "fixed"
  | "percent"
  | "per_km"
  | "quote"
  | "free";

export interface ProdutoDeliveryRegion {
  id: string;
  name: string;
  enabled?: boolean;
  coverageType?: "states" | "cities" | "postal_code" | "radius";
  coverageValue?: string;
  availability?: ProdutoDeliveryAvailability;
  feeType?: ProdutoDeliveryFeeType;
  feeValue?: number | null;
  leadTimeMinDays?: number | null;
  leadTimeMaxDays?: number | null;
  minimumOrder?: number | null;
  freeShippingAbove?: number | null;
  deliveryMode?: "own" | "carrier" | "postal" | "courier" | "pickup" | "redispatch" | "quote";
  notes?: string | null;
}

export interface ProdutoDeliveryRoute {
  id: string;
  name: string;
  regionIds?: string[];
  coverageValue?: string;
  daysOfWeek?: number[];
  frequency?: "weekly" | "biweekly" | "monthly" | "custom";
  cutoffTime?: string | null;
  cutoffDaysBefore?: number | null;
  departureTime?: string | null;
  estimatedWindow?: string | null;
  carrierOrDriver?: string | null;
  vehicle?: string | null;
  capacity?: string | null;
  routeCost?: number | null;
  active?: boolean;
  notes?: string | null;
}

export interface ProdutoDeliveryException {
  id: string;
  date: string;
  type: "blocked" | "extra" | "changed";
  routeId?: string | null;
  description?: string | null;
}

export interface ProdutoDeliveryConfig {
  coverageType?: ProdutoDeliveryCoverageType;
  regions?: ProdutoDeliveryRegion[];
  routes?: ProdutoDeliveryRoute[];
  exceptions?: ProdutoDeliveryException[];
}

export const produtosCatalogoTable = pgTable("produtos_catalogo", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  sku: text("sku"),
  codigoBarras: text("codigo_barras"),
  // Grade de variantes (tamanho/cor) — produtos que são a mesma peça em
  // versões diferentes compartilham o mesmo grupoVarianteId. Null = produto
  // avulso, sem grade. Usado pelo Scout pra detectar "cliente levou essa
  // blusa, mas não levou os outros tamanhos/cores que existem".
  grupoVarianteId: text("grupo_variante_id"),
  tamanho: text("tamanho"),
  cor: text("cor"),
  productType: text("product_type").$type<ProductType>().notNull().default("physical"),
  descricao: text("descricao"),
  descricaoLonga: text("descricao_longa"),
  categoriaId: text("categoria_id").references(() => categoriasProdutoTable.id, { onDelete: "set null" }),
  descontoMaximoPercentual: numeric("desconto_maximo_percentual", { precision: 5, scale: 2 }),
  marca: text("marca"),
  tags: jsonb("tags").$type<string[]>(),
  precoBase: numeric("preco_base", { precision: 12, scale: 2 }).notNull(),
  precoImplantacao: numeric("preco_implantacao", { precision: 12, scale: 2 }),
  precoMensalidade: numeric("preco_mensalidade", { precision: 12, scale: 2 }),
  unidade: text("unidade").notNull().default("un"),
  ativo: boolean("ativo").notNull().default(true),
  destaque: boolean("destaque").notNull().default(false),
  imagemUrl: text("imagem_url"),
  imagens: jsonb("imagens").$type<string[]>(),
  videoUrl: text("video_url"),
  // Produto mestre único: estes campos também alimentam Biblioteca de Projeto,
  // render, orçamento e proposta. Não existe um segundo cadastro técnico.
  projectLibraryEnabled: boolean("project_library_enabled").notNull().default(true),
  textureUrl: text("texture_url"),
  model3dUrl: text("model3d_url"),
  projectTechnicalConfig: jsonb("project_technical_config").$type<ProdutoProjectTechnicalConfig>(),
  peso: numeric("peso", { precision: 10, scale: 3 }),
  dimensoes: jsonb("dimensoes").$type<ProdutoDimensoes>(),
  recorrencia: text("recorrencia"),
  prazoContrato: integer("prazo_contrato"),
  exigeAgendamento: boolean("exige_agendamento").notNull().default(false),
  comissaoPercentual: numeric("comissao_percentual", { precision: 5, scale: 2 }),
  // Promoção configurável (Complemento — Praça.ai/Vendor.ai): preço com
  // desconto e até quando vale. Quando promocaoAtivaAte no passado ou nulo,
  // considerar a promoção inativa mesmo com precoPromocional preenchido.
  precoPromocional: numeric("preco_promocional", { precision: 12, scale: 2 }),
  promocaoAtivaAte: timestamp("promocao_ativa_ate"),
  // Estoque (opt-in por produto — Complemento Praça.ai): quando
  // controlaEstoque=false (padrão), comportamento antigo sem limite é
  // mantido; quando true, estoqueQuantidade passa a valer e o Praça.ai
  // bloqueia venda além do disponível. Coluna já existe fisicamente no
  // banco (aplicada via migração do lado do Praça.ai/Railway, já que
  // ambos compartilham o mesmo Supabase); aqui só formaliza no schema
  // Drizzle do Vendor.ai pra esse código reconhecer o campo quando
  // for republicado.
  controlaEstoque: boolean("controla_estoque").notNull().default(false),
  estoqueQuantidade: integer("estoque_quantidade"),
  // Validade de lote — genérico pra qualquer vertical com produto
  // perecível (distribuidora de alimentos, farmácia, pet food). Null =
  // produto sem controle de validade.
  dataValidade: timestamp("data_validade"),
  // Produto sucessor — quando preenchido, indica que existe uma versão
  // nova desse produto no catálogo. Alimenta "produto com nova versão"
  // do Revenue Scout comprador do Praça.ai.
  produtoSucessorId: text("produto_sucessor_id"),
  // Controle por produto do Praça.ai (Complemento) — a loja pode vender no
  // Praça.ai como um todo (tenants.vendeNoPracaAi) mas ainda assim tirar
  // produtos específicos da vitrine, ou cobrar diferente lá (ex: já embutir
  // a comissão da plataforma no preço). null = herda o comportamento
  // padrão (visível, preço igual ao do Vendor.ai); explícito sobrepõe.
  vendeNoPracaAi: boolean("vende_no_praca_ai_produto"), // nullable de propósito — não confundir com tenants.vendeNoPracaAi (switch geral da loja)
  precoPracaAi: numeric("preco_praca_ai", { precision: 12, scale: 2 }),
  // Venda no marketplace do Arqdor. O produto continua sendo o mesmo produto mestre.
  vendeNoArqdor: boolean("vende_no_arqdor").notNull().default(false),
  precoArqdor: numeric("preco_arqdor", { precision: 12, scale: 2 }),
  // Tabela de especificações livre (Complemento Praça.ai — pedido de
  // paridade com Mercado Livre: Marca/Modelo/Cor/etc). Lista de pares
  // label/value pra caber qualquer categoria (material de construção,
  // eletrônico, o que for), sem precisar de coluna fixa por atributo.
  especificacoes: jsonb("especificacoes").$type<ProdutoEspecificacao[]>(),
  // Compatibilidade veicular — lista de {marca, modelo, anoInicio, anoFim},
  // usada pelo filtro "selecione seu carro" da categoria Acessórios para
  // Veículos no Praça.ai. Vazio/null para produtos sem aplicação automotiva.
  compatibilidadeVeicular: jsonb("compatibilidade_veicular").$type<ProdutoCompatibilidadeVeicular[]>(),
  // Configuração comercial complementar. Mantém o preço oficial em precoBase,
  // mas registra qual método o produto usa e as regras para IA/checkout.
  pricingConfig: jsonb("pricing_config").$type<ProdutoPricingConfig>(),
  // Cobertura logística por produto, incluindo regiões, taxas, rotas, dias de
  // entrega e exceções de calendário. Null = produto sem regra específica.
  deliveryConfig: jsonb("delivery_config").$type<ProdutoDeliveryConfig>(),
  // Inteligência comercial estruturada usada por Vendi, SDR, Closer, MKT e Follow-up.
  // Mantém fatos aprovados (benefícios/diferenciais/provas) separados de texto gerado por IA.
  inteligenciaComercial: jsonb("inteligencia_comercial").$type<ProdutoInteligenciaComercial>().default({}),
  fornecedor: text("fornecedor"),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  custoFornecedor: numeric("custo_fornecedor", { precision: 12, scale: 2 }),
  margemPercentual: numeric("margem_percentual", { precision: 7, scale: 2 }),
  fretePercentual: numeric("frete_percentual", { precision: 7, scale: 2 }),
  custoFinanceiroPercentual: numeric("custo_financeiro_percentual", { precision: 7, scale: 2 }),
  rendimentoPorUnidade: numeric("rendimento_por_unidade", { precision: 12, scale: 3 }),
  unidadeRendimento: text("unidade_rendimento"),
  // Cálculo de orçamento por m² (teto vinílico, revestimento) — Complemento
  // appvendor.ai. tipoCalculo define como o motor de cálculo trata o
  // produto: "area_simples" | "area_com_acabamento_perimetro" |
  // "acabamento_perimetro" | "linear" | "peca_avulsa". colecao é usado
  // pro match automático de acessório compatível por Coleção+Cor (modelo
  // híbrido: sugestão automática, vendedor sempre pode trocar).
  tipoCalculo: text("tipo_calculo"),
  colecao: text("colecao"),
  // Fechamento de pacote — fechamentoPacote = quantidadePacote × tamanho
  // (m² ou m que 1 pacote cobre). precoPacote = preço da embalagem fechada.
  // larguraPecaM é opcional, só pra produtos tipo lâmina/prancha.
  fechamentoPacote: numeric("fechamento_pacote", { precision: 12, scale: 3 }),
  quantidadePacote: integer("quantidade_pacote"),
  precoPacote: numeric("preco_pacote", { precision: 12, scale: 2 }),
  larguraPecaM: numeric("largura_peca_m", { precision: 8, scale: 3 }),
  // Auto-cadastro via IA (sync de estoque do ERP) — produto novo entra
  // como 'pendente_revisao' (e ativo=false, reaproveitando toda a
  // exclusão de site/feed/anúncio já existente por produtosCatalogoTable.ativo)
  // até o lojista conferir/editar e aprovar. avisosRevisao lista o que a
  // IA não conseguiu inferir com segurança (ex: "precisa de foto").
  statusRevisao: text("status_revisao").notNull().default("ok"),
  avisosRevisao: jsonb("avisos_revisao").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
const descontoMaximoPercentualSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage"))
  .nullable();

const comissaoPercentualSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage"))
  .nullable();

const rendimentoDecimalSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,3})?$/, "Invalid yield"));

const precoDecimalSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal price"));

export const insertProdutoCatalogoSchema = createInsertSchema(
  produtosCatalogoTable,
  {
    precoBase: precoDecimalSchema,
    precoImplantacao: precoDecimalSchema.nullable().optional(),
    precoMensalidade: precoDecimalSchema.nullable().optional(),
    precoPromocional: precoDecimalSchema.nullable().optional(),
    precoPracaAi: precoDecimalSchema.nullable().optional(),
    descontoMaximoPercentual: descontoMaximoPercentualSchema.optional(),
    comissaoPercentual: comissaoPercentualSchema.optional(),
    margemPercentual: comissaoPercentualSchema.optional(),
    fretePercentual: comissaoPercentualSchema.optional(),
    custoFinanceiroPercentual: comissaoPercentualSchema.optional(),
    rendimentoPorUnidade: rendimentoDecimalSchema.nullable().optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProdutoCatalogoSchema = createSelectSchema(
  produtosCatalogoTable,
  {
    precoBase: precoDecimalSchema.optional(),
    precoImplantacao: precoDecimalSchema.nullable().optional(),
    precoMensalidade: precoDecimalSchema.nullable().optional(),
    precoPromocional: precoDecimalSchema.nullable().optional(),
    precoPracaAi: precoDecimalSchema.nullable().optional(),
    descontoMaximoPercentual: descontoMaximoPercentualSchema.optional(),
    comissaoPercentual: comissaoPercentualSchema.optional(),
    margemPercentual: comissaoPercentualSchema.optional(),
    fretePercentual: comissaoPercentualSchema.optional(),
    custoFinanceiroPercentual: comissaoPercentualSchema.optional(),
    rendimentoPorUnidade: rendimentoDecimalSchema.nullable().optional(),
  }
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertProdutoCatalogo = z.infer<typeof insertProdutoCatalogoSchema>;
export type UpdateProdutoCatalogo = z.infer<typeof updateProdutoCatalogoSchema>;
export type ProdutoCatalogo = typeof produtosCatalogoTable.$inferSelect;