import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { varejoFornecedorTable } from "./varejo_fornecedores";
import { varejoColecaoTable } from "./varejo_colecoes";

export const varejoPedidoCompraStatusEnum = pgEnum("varejo_pedido_compra_status", [
  "rascunho", "enviado", "confirmado", "entregue", "cancelado",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const varejoPedidoCompraTable = pgTable("varejo_pedidos_compra", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  fornecedorId: text("fornecedor_id").references(() => varejoFornecedorTable.id, { onDelete: "set null" }),
  colecaoId: text("colecao_id").references(() => varejoColecaoTable.id, { onDelete: "set null" }),
  status: varejoPedidoCompraStatusEnum("status").notNull().default("rascunho"),
  dataEmissao: text("data_emissao").notNull(),
  dataPrevista: text("data_prevista"),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoPedidoCompraSchema = createInsertSchema(varejoPedidoCompraTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoPedidoCompraSchema = createSelectSchema(varejoPedidoCompraTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoPedidoCompra = typeof varejoPedidoCompraTable.$inferSelect;
export type InsertVarejoPedidoCompra = z.infer<typeof insertVarejoPedidoCompraSchema>;
