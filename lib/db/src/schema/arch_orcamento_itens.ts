import {
  pgTable,
  varchar,
  text,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";
import { archAmbientesTable } from "./arch_ambientes";

export const archOrcamentoItensTable = pgTable("arch_orcamento_itens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projetoId: text("projeto_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id")
    .references(() => archAmbientesTable.id, { onDelete: "set null" }),
  categoria:     varchar("categoria",     { length: 50  }),
  descricao:     varchar("descricao",     { length: 255 }).notNull(),
  quantidade:    numeric("quantidade",    { precision: 8,  scale: 2 }),
  unidade:       varchar("unidade",       { length: 20  }),
  valorUnitario: numeric("valor_unitario",{ precision: 10, scale: 2 }),
  valorTotal:    numeric("valor_total",   { precision: 12, scale: 2 }),
  fornecedor:    varchar("fornecedor",    { length: 255 }),
  produtoId:     text("produto_id"),
  geradoPorIa:   boolean("gerado_por_ia").default(false),
});

export const insertArchOrcamentoItemSchema = createInsertSchema(
  archOrcamentoItensTable,
  {
    quantidade:    z.coerce.number().nonnegative().optional(),
    valorUnitario: z.coerce.number().nonnegative().optional(),
    valorTotal:    z.coerce.number().nonnegative().optional(),
  },
).omit({ id: true });

export const updateArchOrcamentoItemSchema = createSelectSchema(
  archOrcamentoItensTable,
  {
    quantidade:    z.coerce.number().nonnegative().optional(),
    valorUnitario: z.coerce.number().nonnegative().optional(),
    valorTotal:    z.coerce.number().nonnegative().optional(),
  },
)
  .omit({ id: true, projetoId: true })
  .partial();

export type InsertArchOrcamentoItem = z.infer<typeof insertArchOrcamentoItemSchema>;
export type UpdateArchOrcamentoItem = z.infer<typeof updateArchOrcamentoItemSchema>;
export type ArchOrcamentoItem = typeof archOrcamentoItensTable.$inferSelect;
