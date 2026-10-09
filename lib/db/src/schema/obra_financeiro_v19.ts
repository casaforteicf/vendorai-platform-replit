import { pgTable, text, timestamp, numeric, boolean, date, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { obrasTable, obraOrcamentosTable } from "./obras";
import { obraPedidosCompraTable } from "./obra_compras_v17";
import { obraExecucaoSnapshotsTable } from "./obra_execucao_v18";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^-?\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const FINANCEIRO_TITULO_TIPOS = ["pagar","receber"] as const;
export const FINANCEIRO_TITULO_STATUS = ["previsto","aberto","parcial","pago","recebido","vencido","cancelado"] as const;
export const FINANCEIRO_ORIGENS = ["manual","pedido_compra","medicao_execucao","contrato","orcamento","nf","boleto","recibo","outro"] as const;
export const FINANCEIRO_MOVIMENTO_TIPOS = ["pagamento","recebimento","estorno"] as const;

export const obraFinanceiroTitulosTable = pgTable("obra_financeiro_titulos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  status: text("status").notNull().default("aberto"),
  origem: text("origem").notNull().default("manual"),
  origemId: text("origem_id"),
  pedidoCompraId: text("pedido_compra_id").references(() => obraPedidosCompraTable.id, { onDelete: "set null" }),
  execucaoSnapshotId: text("execucao_snapshot_id").references(() => obraExecucaoSnapshotsTable.id, { onDelete: "set null" }),
  orcamentoId: text("orcamento_id").references(() => obraOrcamentosTable.id, { onDelete: "set null" }),
  contraparte: text("contraparte"),
  documentoNumero: text("documento_numero"),
  descricao: text("descricao").notNull(),
  categoria: text("categoria"),
  centroCusto: text("centro_custo"),
  competencia: date("competencia", { mode: "string" }),
  dataEmissao: date("data_emissao", { mode: "string" }),
  dataVencimento: date("data_vencimento", { mode: "string" }),
  valorOriginal: numeric("valor_original", { precision: 15, scale: 4 }).notNull(),
  valorAberto: numeric("valor_aberto", { precision: 15, scale: 4 }).notNull(),
  valorLiquidado: numeric("valor_liquidado", { precision: 15, scale: 4 }).notNull().default("0"),
  juros: numeric("juros", { precision: 15, scale: 4 }).notNull().default("0"),
  multa: numeric("multa", { precision: 15, scale: 4 }).notNull().default("0"),
  desconto: numeric("desconto", { precision: 15, scale: 4 }).notNull().default("0"),
  previsaoCaixa: boolean("previsao_caixa").notNull().default(true),
  observacoes: text("observacoes"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoStatusIdx: index("obra_financeiro_titulos_obra_tipo_status_idx").on(t.obraId, t.tipo, t.status),
  vencimentoIdx: index("obra_financeiro_titulos_vencimento_idx").on(t.dataVencimento),
  origemIdx: index("obra_financeiro_titulos_origem_idx").on(t.origem, t.origemId),
}));

export const obraFinanceiroMovimentosTable = pgTable("obra_financeiro_movimentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tituloId: text("titulo_id").notNull().references(() => obraFinanceiroTitulosTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  dataMovimento: date("data_movimento", { mode: "string" }).notNull(),
  valor: numeric("valor", { precision: 15, scale: 4 }).notNull(),
  formaPagamento: text("forma_pagamento"),
  contaFinanceira: text("conta_financeira"),
  documentoNumero: text("documento_numero"),
  observacoes: text("observacoes"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tituloDataIdx: index("obra_financeiro_movimentos_titulo_data_idx").on(t.tituloId, t.dataMovimento),
}));

export const obraFinanceiroFluxoSnapshotsTable = pgTable("obra_financeiro_fluxo_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  dataReferencia: date("data_referencia", { mode: "string" }).notNull(),
  contasPagarAberto: numeric("contas_pagar_aberto", { precision: 15, scale: 4 }).notNull().default("0"),
  contasReceberAberto: numeric("contas_receber_aberto", { precision: 15, scale: 4 }).notNull().default("0"),
  pagoAcumulado: numeric("pago_acumulado", { precision: 15, scale: 4 }).notNull().default("0"),
  recebidoAcumulado: numeric("recebido_acumulado", { precision: 15, scale: 4 }).notNull().default("0"),
  saldoCaixa: numeric("saldo_caixa", { precision: 15, scale: 4 }).notNull().default("0"),
  custoRealizado: numeric("custo_realizado", { precision: 15, scale: 4 }).notNull().default("0"),
  receitaContratada: numeric("receita_contratada", { precision: 15, scale: 4 }).notNull().default("0"),
  margemRealizada: numeric("margem_realizada", { precision: 15, scale: 4 }).notNull().default("0"),
  memoriaCalculo: jsonb("memoria_calculo").$type<Record<string, unknown>>().notNull(),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObraFinanceiroTituloSchema = createInsertSchema(obraFinanceiroTitulosTable, {
  tipo: z.enum(FINANCEIRO_TITULO_TIPOS),
  status: z.enum(FINANCEIRO_TITULO_STATUS).optional(),
  origem: z.enum(FINANCEIRO_ORIGENS),
  valorOriginal: decimalOptional,
  valorAberto: decimalOptional,
  valorLiquidado: decimalOptional,
  juros: decimalOptional,
  multa: decimalOptional,
  desconto: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraFinanceiroMovimentoSchema = createInsertSchema(obraFinanceiroMovimentosTable, {
  tipo: z.enum(FINANCEIRO_MOVIMENTO_TIPOS),
  valor: decimalOptional,
}).omit({ id: true, createdAt: true });
