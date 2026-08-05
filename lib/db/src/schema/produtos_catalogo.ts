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

// Compatibilidade veicular (Complemento Praça.ai — filtro "selecione seu
// carro" tipo Tuning Parts). anoFim vazio/null = "até hoje" (ano corrente).
export interface ProdutoCompatibilidadeVeicular {
  marca: string;
  modelo: string;
  anoInicio: number;
  anoFim?: number | null;
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
  // Controle por produto do Praça.ai (Complemento) — a loja pode vender no
  // Praça.ai como um todo (tenants.vendeNoPracaAi) mas ainda assim tirar
  // produtos específicos da vitrine, ou cobrar diferente lá (ex: já embutir
  // a comissão da plataforma no preço). null = herda o comportamento
  // padrão (visível, preço igual ao do Vendor.ai); explícito sobrepõe.
  vendeNoPracaAi: boolean("vende_no_praca_ai_produto"), // nullable de propósito — não confundir com tenants.vendeNoPracaAi (switch geral da loja)
  precoPracaAi: numeric("preco_praca_ai", { precision: 12, scale: 2 }),
  // Tabela de especificações livre (Complemento Praça.ai — pedido de
  // paridade com Mercado Livre: Marca/Modelo/Cor/etc). Lista de pares
  // label/value pra caber qualquer categoria (material de construção,
  // eletrônico, o que for), sem precisar de coluna fixa por atributo.
  especificacoes: jsonb("especificacoes").$type<ProdutoEspecificacao[]>(),
  // Compatibilidade veicular — lista de {marca, modelo, anoInicio, anoFim},
  // usada pelo filtro "selecione seu carro" da categoria Acessórios para
  // Veículos no Praça.ai. Vazio/null para produtos sem aplicação automotiva.
  compatibilidadeVeicular: jsonb("compatibilidade_veicular").$type<ProdutoCompatibilidadeVeicular[]>(),
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
  }
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertProdutoCatalogo = z.infer<typeof insertProdutoCatalogoSchema>;
export type UpdateProdutoCatalogo = z.infer<typeof updateProdutoCatalogoSchema>;
export type ProdutoCatalogo = typeof produtosCatalogoTable.$inferSelect;
