import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

/**
 * A&B (Alimentos & Bebidas) — fundação de dados do módulo (AB-03).
 *
 * ESPELHO da migration `lib/db/migrations/20261103_ab_03_fundacao_ab.sql`.
 * A migration é a fonte de verdade do DDL; este arquivo existe para a API
 * consumir as tabelas com tipagem forte (Drizzle + drizzle-zod), em vez de
 * SQL montado à mão.
 *
 * Regra deste arquivo: se o SQL mudar, o espelho muda junto. Divergência entre
 * os dois é bug silencioso — a API "funciona" e grava num modelo que não é o
 * que o banco validou.
 *
 * ── Sobre as FKs compostas por tenant ────────────────────────────────────────
 * No banco, todas as relações internas usam `(tenant_id, x_id) → (tenant_id, id)`
 * — referência cruzada entre hotéis não é representável. Essas constraints NÃO
 * são declaradas aqui: nenhum schema do repositório declara FK composta, e
 * declará-las exigiria declarar antes os índices únicos `(tenant_id, id)` de
 * `insumos` e `users`, que vivem fora deste arquivo. Consequência:
 *   - tipagem: nenhuma perda (as FKs não influenciam os tipos das colunas);
 *   - `drizzle-kit push`: não rodar contra banco populado — o caminho de DDL
 *     deste módulo é a migration.
 *
 * ── Escopo ───────────────────────────────────────────────────────────────────
 * Só schema. Os endpoints (fichas e sobras) entram no lote seguinte.
 */

// ─── Vocabulário compartilhado ────────────────────────────────────────────────

/** Unidade base de um insumo. `un` não converte para massa/volume. */
export const AB_UNIDADES = ["g", "ml", "un"] as const;

/**
 * Motivo da sobra — mesmos valores do `motivo` da tela de Sobras.
 * É o que separa "treinar a equipe" (erro de produção) de "ajustar quantidade"
 * (buffet) de "ajustar compra/estoque" (validade).
 */
export const AB_MOTIVOS_SOBRA = [
  "erro_producao",
  "sobra_buffet",
  "validade_vencida",
] as const;

/**
 * Origem do lançamento de consumo. `sobra` NÃO entra aqui de propósito: o
 * insumo já foi contabilizado como consumo quando saiu para a produção; somar
 * a sobra contaria duas vezes e inflaria a média diária.
 */
export const AB_ORIGENS_CONSUMO = ["producao", "ajuste", "manual"] as const;

/** Fluxo da ordem de compra gerada pelo motor preditivo. */
export const AB_STATUS_ORDEM_COMPRA = [
  "sugerida",
  "aprovada",
  "enviada",
  "recebida",
  "cancelada",
] as const;

export type AbUnidade = (typeof AB_UNIDADES)[number];
export type AbMotivoSobra = (typeof AB_MOTIVOS_SOBRA)[number];
export type AbOrigemConsumo = (typeof AB_ORIGENS_CONSUMO)[number];
export type AbStatusOrdemCompra = (typeof AB_STATUS_ORDEM_COMPRA)[number];

// ─── Helpers de validação (numeric do Postgres chega como string) ─────────────

const decimal = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Valor decimal inválido (use ponto, sem negativo)"));

const decimalOptional = decimal.optional();

/**
 * decimal > 0 — para os campos que o banco exige positivos (fator de correção,
 * peso da sobra, rendimento, quantidade de item). Sem isso a API aceitaria 0, o
 * Postgres recusaria no CHECK e o erro sairia como 500 em vez de 422.
 */
const decimalPositivo = decimal.refine((v) => Number(v) > 0, "Deve ser maior que zero");

const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato yyyy-mm-dd (fuso do hotel, não UTC)");

// ─── 1) Fichas técnicas ──────────────────────────────────────────────────────

/**
 * Ficha técnica do prato no fluxo de A&B.
 *
 * Coexiste com `hotel_recipe_cards` (HOTEL-02) e NÃO a substitui: lá a ficha é
 * amarrada a `produtos_catalogo`; aqui o insumo pode ser nome livre (ainda não
 * catalogado). A convergência das duas é decisão pendente e está registrada em
 * docs/entregas/AB-03-20261103.md.
 */
export const abFichasTecnicasTable = pgTable(
  "ab_fichas_tecnicas",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    /** Rendimento em porções (o que a tela de FichaTecnica pede). */
    rendimentoPorcoes: numeric("rendimento_porcoes", { precision: 12, scale: 3 }).notNull(),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Alvo da FK composta das tabelas filhas (existe no banco; ver cabeçalho).
    unique("ab_fichas_tecnicas_tenant_id_uq").on(table.tenantId, table.id),
    // Dois pratos com o mesmo nome no mesmo hotel são quase sempre duplicidade.
    unique("ab_fichas_tecnicas_tenant_nome_uq").on(table.tenantId, table.nome),
    index("ab_fichas_tecnicas_tenant_ativo_idx").on(table.tenantId, table.ativo),
    check("ab_fichas_tecnicas_nome_nao_vazio", sql`length(btrim(${table.nome})) > 0`),
    check("ab_fichas_tecnicas_rendimento_positivo", sql`${table.rendimentoPorcoes} > 0`),
  ],
);

export const insertAbFichaTecnicaSchema = createInsertSchema(abFichasTecnicasTable, {
  nome: z.string().trim().min(1).max(120),
  rendimentoPorcoes: decimalPositivo,
  observacoes: z.string().trim().max(2000).nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export const selectAbFichaTecnicaSchema = createSelectSchema(abFichasTecnicasTable);
export type AbFichaTecnica = typeof abFichasTecnicasTable.$inferSelect;
export type InsertAbFichaTecnica = typeof abFichasTecnicasTable.$inferInsert;

// ─── 2) Insumos da ficha ─────────────────────────────────────────────────────

/**
 * Insumo de uma ficha.
 *
 * `insumoId` é opcional: nulo = insumo ainda não catalogado (estado normal
 * enquanto a ficha é montada na cozinha). `insumoNome` é sempre gravado como
 * snapshot — a ficha precisa continuar legível se o item do catálogo for
 * renomeado ou removido.
 */
export const abFichaInsumosTable = pgTable(
  "ab_ficha_insumos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    fichaId: text("ficha_id").notNull(),
    insumoId: text("insumo_id"),
    insumoNome: text("insumo_nome").notNull(),
    unidadeBase: text("unidade_base").notNull(),
    quantidadePorPorcao: numeric("quantidade_por_porcao", { precision: 15, scale: 4 }).notNull(),
    /** Perda/limpeza. 1 = sem perda. Zero ou negativo é digitação errada. */
    fatorCorrecao: numeric("fator_correcao", { precision: 8, scale: 4 }).notNull().default("1"),
    ordem: integer("ordem").notNull().default(0),
    observacao: text("observacao"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // O mesmo insumo não entra duas vezes na mesma ficha — nem pelo catálogo...
    uniqueIndex("ab_ficha_insumos_catalogo_uidx")
      .on(table.tenantId, table.fichaId, table.insumoId)
      .where(sql`${table.insumoId} IS NOT NULL`),
    // ...nem por nome livre (sem caixa e sem espaços nas pontas).
    uniqueIndex("ab_ficha_insumos_nome_uidx")
      .on(table.tenantId, table.fichaId, sql`lower(btrim(${table.insumoNome}))`)
      .where(sql`${table.insumoId} IS NULL`),
    index("ab_ficha_insumos_ficha_idx").on(table.tenantId, table.fichaId, table.ordem),
    index("ab_ficha_insumos_insumo_idx").on(table.tenantId, table.insumoId),
    check(
      "ab_ficha_insumos_unidade_valida",
      sql`${table.unidadeBase} IN ('g', 'ml', 'un')`,
    ),
    check("ab_ficha_insumos_nome_nao_vazio", sql`length(btrim(${table.insumoNome})) > 0`),
    check("ab_ficha_insumos_quantidade_nao_negativa", sql`${table.quantidadePorPorcao} >= 0`),
    check("ab_ficha_insumos_fator_positivo", sql`${table.fatorCorrecao} > 0`),
    check("ab_ficha_insumos_ordem_nao_negativa", sql`${table.ordem} >= 0`),
  ],
);

export const insertAbFichaInsumoSchema = createInsertSchema(abFichaInsumosTable, {
  fichaId: z.string().uuid(),
  insumoId: z.string().uuid().nullable().optional(),
  insumoNome: z.string().trim().min(1).max(120),
  unidadeBase: z.enum(AB_UNIDADES),
  quantidadePorPorcao: decimal,
  fatorCorrecao: decimalPositivo.optional(),
  ordem: z.number().int().min(0).optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export const selectAbFichaInsumoSchema = createSelectSchema(abFichaInsumosTable);
export type AbFichaInsumo = typeof abFichaInsumosTable.$inferSelect;
export type InsertAbFichaInsumo = typeof abFichaInsumosTable.$inferInsert;

// ─── 3) Sobras ───────────────────────────────────────────────────────────────

/**
 * Sobra registrada no fechamento do dia.
 *
 * Sem unicidade por (data, insumo): almoço e jantar podem gerar duas sobras
 * legítimas do mesmo item no mesmo dia.
 */
export const abSobrasTable = pgTable(
  "ab_sobras",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    /** Sem DEFAULT no banco: o dia é o do hotel, não o do fuso do servidor. */
    data: date("data", { mode: "string" }).notNull(),
    insumoId: text("insumo_id"),
    insumoNome: text("insumo_nome").notNull(),
    pesoKg: numeric("peso_kg", { precision: 12, scale: 3 }).notNull(),
    motivo: text("motivo").notNull(),
    /** URL do objeto no storage (R2). */
    fotoUrl: text("foto_url"),
    observacao: text("observacao"),
    registradoPor: text("registrado_por"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ab_sobras_tenant_data_idx").on(table.tenantId, table.data.desc()),
    index("ab_sobras_tenant_insumo_data_idx").on(
      table.tenantId,
      table.insumoId,
      table.data.desc(),
    ),
    index("ab_sobras_tenant_motivo_idx").on(table.tenantId, table.motivo, table.data.desc()),
    check("ab_sobras_nome_nao_vazio", sql`length(btrim(${table.insumoNome})) > 0`),
    check("ab_sobras_peso_positivo", sql`${table.pesoKg} > 0`),
    check(
      "ab_sobras_motivo_valido",
      sql`${table.motivo} IN ('erro_producao', 'sobra_buffet', 'validade_vencida')`,
    ),
  ],
);

export const insertAbSobraSchema = createInsertSchema(abSobrasTable, {
  data: dataISO,
  insumoId: z.string().uuid().nullable().optional(),
  insumoNome: z.string().trim().min(1).max(120),
  pesoKg: decimalPositivo,
  motivo: z.enum(AB_MOTIVOS_SOBRA),
  fotoUrl: z.string().trim().max(2000).nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
  registradoPor: z.string().uuid().nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true });

export const selectAbSobraSchema = createSelectSchema(abSobrasTable);
export type AbSobra = typeof abSobrasTable.$inferSelect;
export type InsertAbSobra = typeof abSobrasTable.$inferInsert;

// ─── 4) Saldos e política de reposição ───────────────────────────────────────

/**
 * Visão gerencial de saldo + política de reposição, por insumo.
 *
 * `saldoAtual` é CONSOLIDADO DERIVADO: a fonte transacional continua sendo
 * `hotel_stock_location_balances` + `hotel_stock_transfer_ledger` (HOTEL-01).
 * Este campo precisa de UM único escritor (rotina de consolidação); se as duas
 * fontes forem editadas à mão, viram duas verdades para "quanto tem".
 */
export const abEstoqueSaldosTable = pgTable(
  "ab_estoque_saldos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    insumoId: text("insumo_id").notNull(),
    saldoAtual: numeric("saldo_atual", { precision: 15, scale: 4 }).notNull().default("0"),
    unidade: text("unidade").notNull(),
    estoqueMinimo: numeric("estoque_minimo", { precision: 15, scale: 4 }).notNull().default("0"),
    /** Dispara a sugestão de compra. Por definição >= estoque_minimo. */
    pontoPedido: numeric("ponto_pedido", { precision: 15, scale: 4 }).notNull().default("0"),
    leadTimeDias: integer("lead_time_dias").notNull().default(0),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("ab_estoque_saldos_tenant_insumo_uq").on(table.tenantId, table.insumoId),
    // Consulta do motor: "quais insumos já estão no ponto de pedido?"
    index("ab_estoque_saldos_reposicao_idx")
      .on(table.tenantId)
      .where(sql`${table.saldoAtual} <= ${table.pontoPedido}`),
    check("ab_estoque_saldos_unidade_valida", sql`${table.unidade} IN ('g', 'ml', 'un')`),
    check("ab_estoque_saldos_saldo_nao_negativo", sql`${table.saldoAtual} >= 0`),
    check("ab_estoque_saldos_minimo_nao_negativo", sql`${table.estoqueMinimo} >= 0`),
    check("ab_estoque_saldos_ponto_nao_negativo", sql`${table.pontoPedido} >= 0`),
    check(
      "ab_estoque_saldos_ponto_maior_igual_minimo",
      sql`${table.pontoPedido} >= ${table.estoqueMinimo}`,
    ),
    check(
      "ab_estoque_saldos_lead_time_valido",
      sql`${table.leadTimeDias} BETWEEN 0 AND 365`,
    ),
  ],
);

export const insertAbEstoqueSaldoSchema = createInsertSchema(abEstoqueSaldosTable, {
  insumoId: z.string().uuid(),
  saldoAtual: decimal.optional(),
  unidade: z.enum(AB_UNIDADES),
  estoqueMinimo: decimal.optional(),
  pontoPedido: decimal.optional(),
  leadTimeDias: z.number().int().min(0).max(365).optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true, atualizadoEm: true })
  .refine(
    (v) => Number(v.pontoPedido ?? 0) >= Number(v.estoqueMinimo ?? 0),
    {
      message: "Ponto de pedido deve ser maior ou igual ao estoque mínimo",
      path: ["pontoPedido"],
    },
  );

export const selectAbEstoqueSaldoSchema = createSelectSchema(abEstoqueSaldosTable);
export type AbEstoqueSaldo = typeof abEstoqueSaldosTable.$inferSelect;
export type InsertAbEstoqueSaldo = typeof abEstoqueSaldosTable.$inferInsert;

// ─── 5) Histórico de consumo ─────────────────────────────────────────────────

/**
 * Agregado diário de consumo — base da média que alimenta o motor preditivo.
 *
 * Idempotente por (insumo, data, origem): recalcular o dia substitui, não
 * duplica. `sobra` não é uma origem válida de propósito (contagem dupla).
 */
export const abHistoricoConsumoTable = pgTable(
  "ab_historico_consumo",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    insumoId: text("insumo_id").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull(),
    unidade: text("unidade").notNull(),
    origem: text("origem").notNull().default("producao"),
    observacao: text("observacao"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ab_historico_consumo_chave_uq").on(
      table.tenantId,
      table.insumoId,
      table.data,
      table.origem,
    ),
    index("ab_historico_consumo_insumo_data_idx").on(
      table.tenantId,
      table.insumoId,
      table.data.desc(),
    ),
    index("ab_historico_consumo_data_idx").on(table.tenantId, table.data.desc()),
    check("ab_historico_consumo_unidade_valida", sql`${table.unidade} IN ('g', 'ml', 'un')`),
    check("ab_historico_consumo_quantidade_nao_negativa", sql`${table.quantidade} >= 0`),
    check(
      "ab_historico_consumo_origem_valida",
      sql`${table.origem} IN ('producao', 'ajuste', 'manual')`,
    ),
  ],
);

export const insertAbHistoricoConsumoSchema = createInsertSchema(abHistoricoConsumoTable, {
  insumoId: z.string().uuid(),
  data: dataISO,
  quantidade: decimal,
  unidade: z.enum(AB_UNIDADES),
  origem: z.enum(AB_ORIGENS_CONSUMO).optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true });

export const selectAbHistoricoConsumoSchema = createSelectSchema(abHistoricoConsumoTable);
export type AbHistoricoConsumo = typeof abHistoricoConsumoTable.$inferSelect;
export type InsertAbHistoricoConsumo = typeof abHistoricoConsumoTable.$inferInsert;

// ─── 6) Ordens de compra ─────────────────────────────────────────────────────

/** Ordem de compra por período de cobertura, gerada pelo motor preditivo. */
export const abOrdensCompraTable = pgTable(
  "ab_ordens_compra",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    coberturaInicio: date("cobertura_inicio", { mode: "string" }).notNull(),
    coberturaFim: date("cobertura_fim", { mode: "string" }).notNull(),
    status: text("status").notNull().default("sugerida"),
    observacao: text("observacao"),
    aprovadaPor: text("aprovada_por"),
    aprovadaEm: timestamp("aprovada_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("ab_ordens_compra_tenant_id_uq").on(table.tenantId, table.id),
    index("ab_ordens_compra_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.coberturaInicio.desc(),
    ),
    check(
      "ab_ordens_compra_status_valido",
      sql`${table.status} IN ('sugerida', 'aprovada', 'enviada', 'recebida', 'cancelada')`,
    ),
    check(
      "ab_ordens_compra_periodo_valido",
      sql`${table.coberturaFim} >= ${table.coberturaInicio}`,
    ),
  ],
);

export const insertAbOrdemCompraSchema = createInsertSchema(abOrdensCompraTable, {
  coberturaInicio: dataISO,
  coberturaFim: dataISO,
  status: z.enum(AB_STATUS_ORDEM_COMPRA).optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
  aprovadaPor: z.string().uuid().nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true, aprovadaEm: true })
  .refine((v) => v.coberturaFim >= v.coberturaInicio, {
    // Datas em yyyy-mm-dd comparam corretamente como string.
    message: "A data final da cobertura precisa ser maior ou igual à inicial",
    path: ["coberturaFim"],
  });

export const selectAbOrdemCompraSchema = createSelectSchema(abOrdensCompraTable);
export type AbOrdemCompra = typeof abOrdensCompraTable.$inferSelect;
export type InsertAbOrdemCompra = typeof abOrdensCompraTable.$inferInsert;

// ─── 7) Itens da ordem ───────────────────────────────────────────────────────

/**
 * Item da ordem. `insumoNome` é snapshot: a ordem emitida não muda porque o
 * catálogo mudou. `custoEstimado` é estimativa (preço na geração), não
 * compromisso fiscal.
 */
export const abOrdemCompraItensTable = pgTable(
  "ab_ordem_compra_itens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    ordemId: text("ordem_id").notNull(),
    insumoId: text("insumo_id").notNull(),
    insumoNome: text("insumo_nome").notNull(),
    quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull(),
    unidade: text("unidade").notNull(),
    custoEstimado: numeric("custo_estimado", { precision: 15, scale: 4 }),
    observacao: text("observacao"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ab_ordem_compra_itens_chave_uq").on(
      table.tenantId,
      table.ordemId,
      table.insumoId,
    ),
    index("ab_ordem_compra_itens_ordem_idx").on(table.tenantId, table.ordemId),
    check("ab_ordem_compra_itens_nome_nao_vazio", sql`length(btrim(${table.insumoNome})) > 0`),
    check("ab_ordem_compra_itens_quantidade_positiva", sql`${table.quantidade} > 0`),
    check("ab_ordem_compra_itens_unidade_valida", sql`${table.unidade} IN ('g', 'ml', 'un')`),
    check(
      "ab_ordem_compra_itens_custo_nao_negativo",
      sql`${table.custoEstimado} IS NULL OR ${table.custoEstimado} >= 0`,
    ),
  ],
);

export const insertAbOrdemCompraItemSchema = createInsertSchema(abOrdemCompraItensTable, {
  ordemId: z.string().uuid(),
  insumoId: z.string().uuid(),
  insumoNome: z.string().trim().min(1).max(120),
  quantidade: decimalPositivo,
  unidade: z.enum(AB_UNIDADES),
  custoEstimado: decimal.nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true });

export const selectAbOrdemCompraItemSchema = createSelectSchema(abOrdemCompraItensTable);
export type AbOrdemCompraItem = typeof abOrdemCompraItensTable.$inferSelect;
export type InsertAbOrdemCompraItem = typeof abOrdemCompraItensTable.$inferInsert;

// ─── 8) Mapa produto de estoque → insumo (AB-04) ─────────────────────────────

/**
 * Liga o catálogo de ESTOQUE (`produtos_catalogo`, via `inventory_items`) ao
 * insumo do motor preditivo (`insumos`).
 *
 * Sem este mapa o job de sincronização não consegue somar
 * `hotel_stock_location_balances` em `ab_estoque_saldos`: são catálogos
 * distintos, sem FK entre si. Um produto mapeia para UM insumo; um insumo pode
 * agregar vários produtos.
 */
export const abInsumoProdutoTable = pgTable(
  "ab_insumo_produto",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    insumoId: text("insumo_id").notNull(),
    produtoCatalogoId: text("produto_catalogo_id").notNull(),
    /** Quantas unidades base do insumo há em 1 unidade de estoque (saco, caixa). */
    fatorEmbalagem: numeric("fator_embalagem", { precision: 15, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("ab_insumo_produto_produto_uq").on(table.tenantId, table.produtoCatalogoId),
    index("ab_insumo_produto_tenant_insumo_idx").on(table.tenantId, table.insumoId),
    check(
      "ab_insumo_produto_fator_positivo",
      sql`${table.fatorEmbalagem} IS NULL OR ${table.fatorEmbalagem} > 0`,
    ),
  ],
);

export const insertAbInsumoProdutoSchema = createInsertSchema(abInsumoProdutoTable, {
  insumoId: z.string().uuid(),
  produtoCatalogoId: z.string().uuid(),
  fatorEmbalagem: decimalPositivo.nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export const selectAbInsumoProdutoSchema = createSelectSchema(abInsumoProdutoTable);
export type AbInsumoProduto = typeof abInsumoProdutoTable.$inferSelect;
export type InsertAbInsumoProduto = typeof abInsumoProdutoTable.$inferInsert;
