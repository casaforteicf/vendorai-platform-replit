import { pgTable, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { foodPedidosTable } from "./food_pedidos";
import { foodCardapioItensTable } from "./food_cardapio_itens";

// Snapshot de nome/preço no momento do pedido -- se o cardápio mudar de
// preço depois, o pedido antigo continua mostrando o valor cobrado de
// verdade (mesmo princípio já usado em propostas/orçamentos no resto do
// sistema).
export const foodPedidoItensTable = pgTable("food_pedido_itens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id")
    .notNull()
    .references(() => foodPedidosTable.id, { onDelete: "cascade" }),
  cardapioItemId: text("cardapio_item_id")
    .references(() => foodCardapioItensTable.id, { onDelete: "set null" }),
  nomeItem: text("nome_item").notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 10, scale: 2 }).notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFoodPedidoItemSchema = createInsertSchema(foodPedidoItensTable, {
  precoUnitario: z.coerce.number().nonnegative(),
  quantidade: z.coerce.number().int().positive(),
}).omit({ id: true, pedidoId: true, createdAt: true });

export type InsertFoodPedidoItem = z.infer<typeof insertFoodPedidoItemSchema>;
export type FoodPedidoItem       = typeof foodPedidoItensTable.$inferSelect;
