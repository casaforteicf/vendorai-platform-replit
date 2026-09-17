import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// Bucket "food_service" (Bloco 4 da proposta de agrupamento de verticais,
// 17/09): Restaurante, Pizzaria, Hamburgueria, Padaria, Confeitaria/Doceria,
// Cafeteria, Marmitaria, Food truck, Delivery de comida. Modelo genérico o
// bastante pra cobrir cardápio de restaurante e vitrine de padaria com as
// mesmas colunas -- "categoria" e "tempoPreparoMin" ficam livres pra cada
// tenant adaptar ao próprio negócio.
export const FOOD_CATEGORIAS = [
  "entrada",
  "prato_principal",
  "lanche",
  "pizza",
  "bebida",
  "sobremesa",
  "padaria",
  "outro",
] as const;

export const foodCardapioItensTable = pgTable("food_cardapio_itens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  categoria: varchar("categoria", { length: 40 }).notNull().default("outro"),
  preco: numeric("preco", { precision: 10, scale: 2 }).notNull(),
  // Minutos estimados entre pedido feito e pronto -- usado pro ETA do
  // pedido, mesmo padrão de estimativa já usado em Fretes (estimarEtaMinutos).
  tempoPreparoMin: integer("tempo_preparo_min"),
  fotoUrl: text("foto_url"),
  disponivel: boolean("disponivel").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFoodCardapioItemSchema = createInsertSchema(foodCardapioItensTable, {
  preco: z.coerce.number().nonnegative(),
  tempoPreparoMin: z.coerce.number().int().positive().optional().nullable(),
  categoria: z.enum(FOOD_CATEGORIAS).optional(),
}).omit({ id: true, tenantId: true, createdAt: true });

export const updateFoodCardapioItemSchema = createSelectSchema(foodCardapioItensTable, {
  preco: z.coerce.number().nonnegative().optional(),
  tempoPreparoMin: z.coerce.number().int().positive().optional().nullable(),
  categoria: z.enum(FOOD_CATEGORIAS).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertFoodCardapioItem = z.infer<typeof insertFoodCardapioItemSchema>;
export type UpdateFoodCardapioItem = z.infer<typeof updateFoodCardapioItemSchema>;
export type FoodCardapioItem       = typeof foodCardapioItensTable.$inferSelect;
