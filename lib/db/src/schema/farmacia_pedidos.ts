import { pgTable, text, timestamp, numeric, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { scoutOportunidadesTable } from "./scout_oportunidades";

export const farmaciaPedidoStatusEnum = pgEnum("farmacia_pedido_status", [
  "aguardando_confirmacao", "aguardando_receita", "confirmado",
  "em_separacao", "saiu_para_entrega", "entregue", "cancelado",
]);

export const farmaciaPedidoOrigemEnum = pgEnum("farmacia_pedido_origem", [
  "whatsapp", "app", "balcao",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const farmaciaPedidoTable = pgTable("farmacia_pedidos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  scoutOportunidadeId: text("scout_oportunidade_id").references(() => scoutOportunidadesTable.id, { onDelete: "set null" }),
  origem: farmaciaPedidoOrigemEnum("origem").notNull().default("whatsapp"),
  status: farmaciaPedidoStatusEnum("status").notNull().default("aguardando_confirmacao"),
  enderecoEntrega: text("endereco_entrega"),
  // Se algum item do pedido exige receita, esse campo precisa estar
  // preenchido antes do status sair de 'aguardando_receita'.
  temItemControlado: boolean("tem_item_controlado").notNull().default(false),
  receitaUrl: text("receita_url"),
  // Vínculo com a receita estruturada (validade, tipo, médico) — quando
  // presente, substitui a necessidade só da foto solta em receitaUrl.
  receitaMedicaId: text("receita_medica_id"),
  observacoes: text("observacoes"),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull().default("0"),
  erpPedidoId: text("erp_pedido_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const farmaciaPedidoItemTable = pgTable("farmacia_pedido_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => farmaciaPedidoTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id"),
  nomeProduto: text("nome_produto").notNull(),
  exigeReceita: boolean("exige_receita").notNull().default(false),
  quantidade: numeric("quantidade", { precision: 10, scale: 3 }).notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const insertFarmaciaPedidoSchema = createInsertSchema(farmaciaPedidoTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateFarmaciaPedidoSchema = createSelectSchema(farmaciaPedidoTable, {
  valorTotal: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertFarmaciaPedidoItemSchema = createInsertSchema(farmaciaPedidoItemTable, {
  quantidade: decimalField,
  precoUnitario: decimalField,
  subtotal: decimalField,
}).omit({ id: true });

export type FarmaciaPedido = typeof farmaciaPedidoTable.$inferSelect;
export type FarmaciaPedidoItem = typeof farmaciaPedidoItemTable.$inferSelect;
export type InsertFarmaciaPedido = z.infer<typeof insertFarmaciaPedidoSchema>;
