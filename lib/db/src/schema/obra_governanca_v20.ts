import { pgTable, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { obrasTable } from "./obras";

export const RELATORIO_TIPOS = [
  "orcamento",
  "cotacoes",
  "compras",
  "execucao",
  "financeiro",
  "margem",
  "consolidado",
] as const;

export const obraRelatoriosSalvosTable = pgTable("obra_relatorios_salvos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").references(() => obrasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  filtros: jsonb("filtros").$type<Record<string, unknown>>().notNull().default({}),
  colunas: jsonb("colunas").$type<string[]>().notNull().default([]),
  ordenacao: jsonb("ordenacao").$type<Array<{ campo: string; direcao: "asc" | "desc" }>>().notNull().default([]),
  compartilhado: boolean("compartilhado").notNull().default(false),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantTipoIdx: index("obra_relatorios_salvos_tenant_tipo_idx").on(t.tenantId, t.tipo),
  obraIdx: index("obra_relatorios_salvos_obra_idx").on(t.obraId),
}));

export const obraAuditoriaEventosTable = pgTable("obra_auditoria_eventos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").references(() => obrasTable.id, { onDelete: "cascade" }),
  usuarioId: text("usuario_id").references(() => usersTable.id, { onDelete: "set null" }),
  modulo: text("modulo").notNull(),
  acao: text("acao").notNull(),
  entidade: text("entidade").notNull(),
  entidadeId: text("entidade_id"),
  resumo: text("resumo"),
  antes: jsonb("antes").$type<Record<string, unknown> | null>(),
  depois: jsonb("depois").$type<Record<string, unknown> | null>(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  obraDataIdx: index("obra_auditoria_eventos_obra_data_idx").on(t.obraId, t.createdAt),
  entidadeIdx: index("obra_auditoria_eventos_entidade_idx").on(t.entidade, t.entidadeId),
  moduloIdx: index("obra_auditoria_eventos_modulo_idx").on(t.modulo),
}));

export const obraPermissoesOperacionaisTable = pgTable("obra_permissoes_operacionais", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  chave: text("chave").notNull(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  rolesPermitidas: jsonb("roles_permitidas").$type<string[]>().notNull().default([]),
  funcoesPermitidas: jsonb("funcoes_permitidas").$type<string[]>().notNull().default([]),
  usuariosPermitidos: jsonb("usuarios_permitidos").$type<string[]>().notNull().default([]),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantChaveIdx: index("obra_permissoes_operacionais_tenant_chave_idx").on(t.tenantId, t.chave),
}));

export const insertObraRelatorioSalvoSchema = createInsertSchema(obraRelatoriosSalvosTable, {
  tipo: z.enum(RELATORIO_TIPOS),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPermissaoOperacionalSchema = createInsertSchema(obraPermissoesOperacionaisTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
