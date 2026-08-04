import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { produtosCatalogoTable } from "./produtos_catalogo";

export const receitaTipoEnum = pgEnum("receita_tipo", ["comum", "controlado"]);
export const receitaStatusEnum = pgEnum("receita_status", ["ativa", "vencida", "utilizada", "renovada"]);

export const receitasMedicasTable = pgTable("receitas_medicas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  // Link opcional com o catálogo — nem sempre o medicamento está cadastrado
  // como produto, então o nome sempre é preenchido também.
  produtoId: text("produto_id").references(() => produtosCatalogoTable.id, { onDelete: "set null" }),
  medicamentoNome: text("medicamento_nome").notNull(),
  tipo: receitaTipoEnum("tipo").notNull().default("comum"),
  medico: text("medico"),
  crm: text("crm"),
  dataEmissao: timestamp("data_emissao").notNull(),
  dataValidade: timestamp("data_validade").notNull(),
  quantidadeCaixas: integer("quantidade_caixas"),
  status: receitaStatusEnum("status").notNull().default("ativa"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReceitaMedicaSchema = createInsertSchema(receitasMedicasTable, {
  dataEmissao: z.coerce.date(),
  dataValidade: z.coerce.date(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateReceitaMedicaSchema = createSelectSchema(receitasMedicasTable, {
  dataEmissao: z.coerce.date().optional(),
  dataValidade: z.coerce.date().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type ReceitaMedica = typeof receitasMedicasTable.$inferSelect;
export type InsertReceitaMedica = z.infer<typeof insertReceitaMedicaSchema>;
