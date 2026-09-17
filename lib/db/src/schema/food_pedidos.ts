import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

// tipo: mesa (consumo local) | delivery (entrega) | retirada (balcão)
// status: recebido → preparando → pronto → (delivery: em_entrega →) entregue
//         | cancelado a qualquer momento
export const FOOD_PEDIDO_TIPOS = ["mesa", "delivery", "retirada"] as const;
export const FOOD_PEDIDO_STATUS = [
  "recebido",
  "preparando",
  "pronto",
  "em_entrega",
  "entregue",
  "cancelado",
] as const;

export const foodPedidosTable = pgTable("food_pedidos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  // Nulo permitido -- cliente de balcão/mesa muitas vezes não vira lead
  // (diferente de servicos_ordens, onde a visita técnica sempre tem um
  // cliente identificado de antemão).
  clienteId: text("cliente_id").references(() => leadsTable.id, { onDelete: "set null" }),
  clienteNome: varchar("cliente_nome", { length: 255 }),
  clienteTelefone: varchar("cliente_telefone", { length: 20 }),
  tipo: varchar("tipo", { length: 20 }).notNull().default("mesa"),
  mesaNumero: varchar("mesa_numero", { length: 20 }),
  enderecoEntrega: text("endereco_entrega"),
  status: varchar("status", { length: 20 }).notNull().default("recebido"),
  valorTotal: numeric("valor_total", { precision: 10, scale: 2 }).notNull().default("0"),
  formaPagamento: varchar("forma_pagamento", { length: 30 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFoodPedidoSchema = createInsertSchema(foodPedidosTable, {
  valorTotal: z.coerce.number().nonnegative().optional(),
  tipo: z.enum(FOOD_PEDIDO_TIPOS).optional(),
  status: z.enum(FOOD_PEDIDO_STATUS).optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export const updateFoodPedidoSchema = createSelectSchema(foodPedidosTable, {
  valorTotal: z.coerce.number().nonnegative().optional(),
  tipo: z.enum(FOOD_PEDIDO_TIPOS).optional(),
  status: z.enum(FOOD_PEDIDO_STATUS).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertFoodPedido = z.infer<typeof insertFoodPedidoSchema>;
export type UpdateFoodPedido = z.infer<typeof updateFoodPedidoSchema>;
export type FoodPedido       = typeof foodPedidosTable.$inferSelect;
