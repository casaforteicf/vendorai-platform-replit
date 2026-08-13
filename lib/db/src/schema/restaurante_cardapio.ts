import { pgTable, text, timestamp, numeric, boolean, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const restauranteCategoriaCardapioEnum = pgEnum("restaurante_categoria_cardapio", [
  "entrada", "prato_principal", "sobremesa", "bebida", "combo", "outros",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const restauranteCardapioTable = pgTable("restaurante_cardapio", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  categoria: restauranteCategoriaCardapioEnum("categoria"),
  preco: numeric("preco", { precision: 10, scale: 2 }).notNull(),
  tempoPreparoMinutos: integer("tempo_preparo_minutos").default(20),
  // Nem todo item do cardápio é servido o dia todo (ex: prato de almoço
  // executivo só até 15h) — diferente de farmácia/mercado, onde o produto
  // fica disponível o horário de funcionamento inteiro.
  disponivelAlmoco: boolean("disponivel_almoco").notNull().default(true),
  disponivelJantar: boolean("disponivel_jantar").notNull().default(true),
  imagemUrl: text("imagem_url"),
  ativo: boolean("ativo").notNull().default(true),
  vendeNoPracaAi: boolean("vende_no_praca_ai").notNull().default(false),
  destaqueWhatsapp: boolean("destaque_whatsapp").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRestauranteCardapioSchema = createInsertSchema(restauranteCardapioTable, {
  preco: decimalField,
  tempoPreparoMinutos: z.coerce.number().int().positive().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateRestauranteCardapioSchema = createSelectSchema(restauranteCardapioTable, {
  preco: decimalField.optional(),
  tempoPreparoMinutos: z.coerce.number().int().positive().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type RestauranteCardapioItem = typeof restauranteCardapioTable.$inferSelect;
export type InsertRestauranteCardapioItem = z.infer<typeof insertRestauranteCardapioSchema>;
