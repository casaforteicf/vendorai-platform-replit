import { pgTable, text, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

// Pacote genérico — diferente de varejo_combos (que só combina produtos
// físicos do Varejo), esse combina QUALQUER mistura de itens do catálogo
// genérico: quarto (productType=service) + spa (service) + jantar
// (service/physical), com preço único. Serve pra hotelaria, mas também
// pra qualquer vertical que precise de "cesta"/"kit" (cesta de filhote,
// kit gripe da farmácia etc).
export const pacotesTable = pgTable("pacotes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  precoPacote: numeric("preco_pacote", { precision: 12, scale: 2 }).notNull(),
  ativo: boolean("ativo").notNull().default(true),
  // Vínculo com o catálogo genérico — o pacote em si também vira 1
  // produto vendável/rastreável (Praça.ai, Scout), preenchido pela
  // sincronização, não editado à mão.
  produtoCatalogoId: text("produto_catalogo_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pacoteItensTable = pgTable("pacote_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pacoteId: text("pacote_id").notNull().references(() => pacotesTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id").notNull().references(() => produtosCatalogoTable.id, { onDelete: "cascade" }),
  quantidade: integer("quantidade").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPacoteSchema = createInsertSchema(pacotesTable, {
  precoPacote: decimalField,
}).omit({ id: true, createdAt: true, updatedAt: true, produtoCatalogoId: true });

export const updatePacoteSchema = createSelectSchema(pacotesTable, {
  precoPacote: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true, produtoCatalogoId: true }).partial();

export const insertPacoteItemSchema = createInsertSchema(pacoteItensTable)
  .omit({ id: true, createdAt: true });

export type Pacote = typeof pacotesTable.$inferSelect;
export type PacoteItem = typeof pacoteItensTable.$inferSelect;
export type InsertPacote = z.infer<typeof insertPacoteSchema>;
