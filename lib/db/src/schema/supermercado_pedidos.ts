import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const supermercadoPedidoStatusEnum = pgEnum("supermercado_pedido_status", [
  "aguardando_confirmacao", "confirmado", "em_separacao", "saiu_para_entrega",
  "entregue", "cancelado",
]);

export const supermercadoPedidoOrigemEnum = pgEnum("supermercado_pedido_origem", [
  "whatsapp", "app", "balcao",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const supermercadoPedidoTable = pgTable("supermercado_pedidos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  origem: supermercadoPedidoOrigemEnum("origem").notNull().default("whatsapp"),
  status: supermercadoPedidoStatusEnum("status").notNull().default("aguardando_confirmacao"),
  enderecoEntrega: text("endereco_entrega"),
  observacoes: text("observacoes"),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull().default("0"),
  erpPedidoId: text("erp_pedido_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supermercadoPedidoItemTable = pgTable("supermercado_pedido_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => supermercadoPedidoTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id"),
  nomeProduto: text("nome_produto").notNull(),
  quantidade: numeric("quantidade", { precision: 10, scale: 3 }).notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const insertSupermercadoPedidoSchema = createInsertSchema(supermercadoPedidoTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateSupermercadoPedidoSchema = createSelectSchema(supermercadoPedidoTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertSupermercadoPedidoItemSchema = createInsertSchema(supermercadoPedidoItemTable, {
  quantidade: decimalField,
  precoUnitario: decimalField,
  subtotal: decimalField,
}).omit({ id: true });

export type SupermercadoPedido = typeof supermercadoPedidoTable.$inferSelect;
export type SupermercadoPedidoItem = typeof supermercadoPedidoItemTable.$inferSelect;
export type InsertSupermercadoPedido = z.infer<typeof insertSupermercadoPedidoSchema>;
