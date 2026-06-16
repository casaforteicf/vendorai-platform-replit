import { pgTable, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const obrasTable = pgTable("obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  clienteNome: text("cliente_nome"),
  clienteContato: text("cliente_contato"),
  endereco: text("endereco"),
  status: text("status").notNull().default("planejamento"),
  dataInicio: date("data_inicio", { mode: "string" }),
  dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
  dataFimReal: date("data_fim_real", { mode: "string" }),
  orcamentoTotal: numeric("orcamento_total", { precision: 15, scale: 2 }),
  custoRealizado: numeric("custo_realizado", { precision: 15, scale: 2 }).notNull().default("0"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  linkCliente: text("link_cliente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const insertObraSchema = createInsertSchema(obrasTable, {
  orcamentoTotal: decimalOptional,
  custoRealizado: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraSchema = createSelectSchema(obrasTable, {
  orcamentoTotal: decimalOptional,
  custoRealizado: decimalOptional,
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertObra = z.infer<typeof insertObraSchema>;
export type UpdateObra = z.infer<typeof updateObraSchema>;
export type Obra = typeof obrasTable.$inferSelect;

// ─── Etapas ──────────────────────────────────────────────────────────────────

export const obraEtapasTable = pgTable("obra_etapas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id")
    .notNull()
    .references(() => obrasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  ordem: integer("ordem").notNull().default(0),
  dataInicioPrevista: date("data_inicio_prevista", { mode: "string" }),
  dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
  dataInicioReal: date("data_inicio_real", { mode: "string" }),
  dataFimReal: date("data_fim_real", { mode: "string" }),
  status: text("status").notNull().default("pendente"),
  percentualExecutado: numeric("percentual_executado", { precision: 5, scale: 2 }).notNull().default("0"),
  responsavel: text("responsavel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraEtapaSchema = createInsertSchema(obraEtapasTable, {
  percentualExecutado: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraEtapaSchema = createSelectSchema(obraEtapasTable, {
  percentualExecutado: decimalOptional,
})
  .omit({ id: true, obraId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertObraEtapa = z.infer<typeof insertObraEtapaSchema>;
export type UpdateObraEtapa = z.infer<typeof updateObraEtapaSchema>;
export type ObraEtapa = typeof obraEtapasTable.$inferSelect;

// ─── Medições ─────────────────────────────────────────────────────────────────

export const obraEtapaMedicoesTable = pgTable("obra_etapa_medicoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  etapaId: text("etapa_id")
    .notNull()
    .references(() => obraEtapasTable.id, { onDelete: "cascade" }),
  data: date("data", { mode: "string" }).notNull(),
  percentualAnterior: numeric("percentual_anterior", { precision: 5, scale: 2 }).notNull().default("0"),
  percentualNovo: numeric("percentual_novo", { precision: 5, scale: 2 }).notNull(),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObraEtapaMedicaoSchema = createInsertSchema(obraEtapaMedicoesTable, {
  percentualAnterior: decimalOptional,
  percentualNovo: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal")),
}).omit({ id: true, createdAt: true });

export type InsertObraEtapaMedicao = z.infer<typeof insertObraEtapaMedicaoSchema>;
export type ObraEtapaMedicao = typeof obraEtapaMedicoesTable.$inferSelect;
