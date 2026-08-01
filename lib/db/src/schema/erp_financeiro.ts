import { pgEnum, pgTable, text, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const erpTituloTipoEnum = pgEnum("erp_titulo_tipo", ["receber", "pagar"]);
export const erpTituloStatusEnum = pgEnum("erp_titulo_status", ["pendente", "pago", "vencido", "cancelado"]);
export const erpCategoriaEnum = pgEnum("erp_categoria", ["receita", "custo", "despesa", "imposto", "investimento"]);
export const erpDocumentoTipoEnum = pgEnum("erp_documento_tipo", ["nfe", "nfse", "boleto"]);
export const erpDocumentoStatusEnum = pgEnum("erp_documento_status", ["rascunho", "processando", "autorizado", "rejeitado", "cancelado"]);

const money = z.union([z.string(), z.number()]).transform(String);

export const erpTitulosTable = pgTable("erp_titulos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  tipo: erpTituloTipoEnum("tipo").notNull(),
  categoria: erpCategoriaEnum("categoria").notNull(),
  descricao: text("descricao").notNull(),
  pessoa: text("pessoa"),
  documento: text("documento"),
  valorOriginal: numeric("valor_original", { precision: 14, scale: 2 }).notNull(),
  juros: numeric("juros", { precision: 14, scale: 2 }).notNull().default("0"),
  multa: numeric("multa", { precision: 14, scale: 2 }).notNull().default("0"),
  desconto: numeric("desconto", { precision: 14, scale: 2 }).notNull().default("0"),
  valorPago: numeric("valor_pago", { precision: 14, scale: 2 }).notNull().default("0"),
  vencimento: timestamp("vencimento", { withTimezone: true }).notNull(),
  pagoEm: timestamp("pago_em", { withTimezone: true }),
  status: erpTituloStatusEnum("status").notNull().default("pendente"),
  contaBancaria: text("conta_bancaria"),
  origemTipo: text("origem_tipo"),
  origemId: text("origem_id"),
  observacoes: text("observacoes"),
  provedorCobranca: text("provedor_cobranca"),
  provedorCobrancaId: text("provedor_cobranca_id"),
  urlCobranca: text("url_cobranca"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("erp_titulos_origem_unique").on(table.tenantId, table.origemTipo, table.origemId)]);

export const erpPagamentosTable = pgTable("erp_pagamentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  tituloId: text("titulo_id").notNull().references(() => erpTitulosTable.id, { onDelete: "cascade" }),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
  juros: numeric("juros", { precision: 14, scale: 2 }).notNull().default("0"),
  multa: numeric("multa", { precision: 14, scale: 2 }).notNull().default("0"),
  desconto: numeric("desconto", { precision: 14, scale: 2 }).notNull().default("0"),
  forma: text("forma"),
  contaBancaria: text("conta_bancaria"),
  conciliacaoId: text("conciliacao_id"),
  pagoEm: timestamp("pago_em", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const erpDocumentosFiscaisTable = pgTable("erp_documentos_fiscais", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  tipo: erpDocumentoTipoEnum("tipo").notNull(),
  status: erpDocumentoStatusEnum("status").notNull().default("rascunho"),
  tituloId: text("titulo_id").references(() => erpTitulosTable.id, { onDelete: "set null" }),
  numero: text("numero"),
  chave: text("chave"),
  provedor: text("provedor"),
  provedorId: text("provedor_id"),
  destinatario: text("destinatario").notNull(),
  documentoDestinatario: text("documento_destinatario"),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
  url: text("url"),
  erro: text("erro"),
  emitidoEm: timestamp("emitido_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertErpTituloSchema = createInsertSchema(erpTitulosTable, {
  valorOriginal: money, juros: money.optional(), multa: money.optional(), desconto: money.optional(), valorPago: money.optional(), vencimento: z.coerce.date(), pagoEm: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const updateErpTituloSchema = createSelectSchema(erpTitulosTable, {
  valorOriginal: money.optional(), juros: money.optional(), multa: money.optional(), desconto: money.optional(), valorPago: money.optional(), vencimento: z.coerce.date().optional(), pagoEm: z.coerce.date().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();
export const insertErpPagamentoSchema = createInsertSchema(erpPagamentosTable, {
  valor: money, juros: money.optional(), multa: money.optional(), desconto: money.optional(), pagoEm: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true });
export const insertErpDocumentoFiscalSchema = createInsertSchema(erpDocumentosFiscaisTable, { valor: money, emitidoEm: z.coerce.date().optional() }).omit({ id: true, createdAt: true, updatedAt: true });

