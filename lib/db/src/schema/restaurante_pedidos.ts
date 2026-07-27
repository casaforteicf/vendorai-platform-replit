import { pgTable, text, timestamp, numeric, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const restaurantePedidoStatusEnum = pgEnum("restaurante_pedido_status", [
  "aguardando_confirmacao", "confirmado", "em_preparo",
  "saiu_para_entrega", "pronto_retirada", "entregue", "cancelado",
]);

// "mesa" — diferente de mercado/farmácia, restaurante tem consumo no local
// como modalidade tão comum quanto entrega/retirada.
export const restaurantePedidoOrigemEnum = pgEnum("restaurante_pedido_origem", [
  "whatsapp", "app", "mesa", "balcao",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const restaurantePedidoTable = pgTable("restaurante_pedidos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  origem: restaurantePedidoOrigemEnum("origem").notNull().default("whatsapp"),
  status: restaurantePedidoStatusEnum("status").notNull().default("aguardando_confirmacao"),
  numeroMesa: integer("numero_mesa"),
  enderecoEntrega: text("endereco_entrega"),
  observacoes: text("observacoes"),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull().default("0"),
  tempoEstimadoMinutos: integer("tempo_estimado_minutos"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const restaurantePedidoItemTable = pgTable("restaurante_pedido_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => restaurantePedidoTable.id, { onDelete: "cascade" }),
  cardapioItemId: text("cardapio_item_id"),
  nomeItem: text("nome_item").notNull(),
  observacaoItem: text("observacao_item"), // ex: "sem cebola"
  quantidade: numeric("quantidade", { precision: 10, scale: 3 }).notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const insertRestaurantePedidoSchema = createInsertSchema(restaurantePedidoTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateRestaurantePedidoSchema = createSelectSchema(restaurantePedidoTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertRestaurantePedidoItemSchema = createInsertSchema(restaurantePedidoItemTable, {
  quantidade: decimalField,
  precoUnitario: decimalField,
  subtotal: decimalField,
}).omit({ id: true });

export type RestaurantePedido = typeof restaurantePedidoTable.$inferSelect;
export type RestaurantePedidoItem = typeof restaurantePedidoItemTable.$inferSelect;
export type InsertRestaurantePedido = z.infer<typeof insertRestaurantePedidoSchema>;
