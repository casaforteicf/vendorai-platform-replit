import { pgTable, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { varejoPedidoCompraTable } from "./varejo_pedidos_compra";
import { varejoProdutoTable } from "./varejo_produtos";

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const varejoPedidoCompraItemTable = pgTable("varejo_pedidos_compra_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => varejoPedidoCompraTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id").references(() => varejoProdutoTable.id, { onDelete: "set null" }),
  tamanho: text("tamanho").notNull(),
  cor: text("cor").notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVarejoPedidoCompraItemSchema = createInsertSchema(varejoPedidoCompraItemTable, {
  precoUnitario: decimalField,
}).omit({ id: true, createdAt: true });

export type VarejoPedidoCompraItem = typeof varejoPedidoCompraItemTable.$inferSelect;
export type InsertVarejoPedidoCompraItem = z.infer<typeof insertVarejoPedidoCompraItemSchema>;
