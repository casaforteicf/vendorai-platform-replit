import { pgTable, text, timestamp, boolean, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

export const SOLICITACAO_COMPRA_STATUS = ["pendente", "aprovado", "reprovado", "enviado"] as const;
export type SolicitacaoCompraStatus = typeof SOLICITACAO_COMPRA_STATUS[number];

// Fornecedor genérico — universal, não travado em nenhuma vertical (diferente
// de varejo_fornecedores, que é específico do módulo de confecção/varejo).
export const fornecedoresTable = pgTable("fornecedores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  contato: text("contato"), // nome do vendedor/representante
  telefone: text("telefone"),
  email: text("email"),
  categorias: jsonb("categorias").$type<string[]>().notNull().default([]),
  disciplinas: jsonb("disciplinas").$type<string[]>().notNull().default([]),
  regioes: jsonb("regioes").$type<string[]>().notNull().default([]),
  marcas: jsonb("marcas").$type<string[]>().notNull().default([]),
  prazoMedioDias: integer("prazo_medio_dias"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const solicitacoesCompraTable = pgTable("solicitacoes_compra", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  // Snapshot do nome do produto no momento da solicitação — sobrevive mesmo
  // se o produto for editado/removido do catálogo depois.
  produtoId: text("produto_id").references(() => produtosCatalogoTable.id, { onDelete: "set null" }),
  produtoNome: text("produto_nome").notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  fornecedorId: text("fornecedor_id").references(() => fornecedoresTable.id, { onDelete: "set null" }),
  fornecedorNome: text("fornecedor_nome").notNull(),
  fornecedorContato: text("fornecedor_contato"),
  fornecedorTelefone: text("fornecedor_telefone"),
  fornecedorEmail: text("fornecedor_email"),
  ultimoValorPago: numeric("ultimo_valor_pago", { precision: 12, scale: 2 }),
  cotacaoAtual: numeric("cotacao_atual", { precision: 12, scale: 2 }),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  condicaoPagamento: text("condicao_pagamento"),
  status: text("status").$type<SolicitacaoCompraStatus>().notNull().default("pendente"),
  aprovadoPor: text("aprovado_por"),
  aprovadoEm: timestamp("aprovado_em"),
  // Se true, ao aprovar o sistema já dispara o pedido pro fornecedor
  // (WhatsApp/e-mail, dependendo do que estiver cadastrado) em vez de só
  // marcar como aprovado esperando um envio manual.
  enviarPedidoAutomatico: boolean("enviar_pedido_automatico").notNull().default(false),
  enviadoEm: timestamp("enviado_em"),
  observacoes: text("observacoes"),
  criadoPorNome: text("criado_por_nome"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFornecedorSchema = createInsertSchema(fornecedoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateFornecedorSchema = insertFornecedorSchema.partial();
export type Fornecedor = typeof fornecedoresTable.$inferSelect;

export const insertSolicitacaoCompraSchema = createInsertSchema(solicitacoesCompraTable, { status: z.enum(SOLICITACAO_COMPRA_STATUS).optional() })
  .omit({ id: true, createdAt: true, updatedAt: true, aprovadoPor: true, aprovadoEm: true, enviadoEm: true });
export const updateSolicitacaoCompraSchema = createSelectSchema(solicitacoesCompraTable, { status: z.enum(SOLICITACAO_COMPRA_STATUS).optional() })
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();
export type SolicitacaoCompra = typeof solicitacoesCompraTable.$inferSelect;
export type InsertSolicitacaoCompra = z.infer<typeof insertSolicitacaoCompraSchema>;
