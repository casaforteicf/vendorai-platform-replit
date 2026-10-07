import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { archMarketplaceItemsTable } from "./arch_marketplace_items";
import { archProjetosTable } from "./arch_projetos";

export const archMarketplacePedidosTable = pgTable("arch_marketplace_pedidos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  compradorTenantId: text("comprador_tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => archMarketplaceItemsTable.id, { onDelete: "restrict" }),
  projetoId: text("projeto_id")
    .references(() => archProjetosTable.id, { onDelete: "set null" }),
  quantidade:    numeric("quantidade",     { precision: 8,  scale: 2 }),
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }),
  valorTotal:    numeric("valor_total",    { precision: 12, scale: 2 }),
  comissao:      numeric("comissao",       { precision: 10, scale: 2 }),
  marketDemandId: uuid("market_demand_id"),
  commissionRuleId: uuid("commission_rule_id"),
  commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }),
  pracaOrderId: text("praca_order_id"),
  paymentStatus: varchar("payment_status", { length: 30 }).default("pending"),
  paymentProvider: varchar("payment_provider", { length: 30 }),
  paymentIntentId: text("payment_intent_id"),
  status:        varchar("status",         { length: 20 }).default("pendente"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const insertArchMarketplacePedidoSchema = createInsertSchema(
  archMarketplacePedidosTable,
  {
    quantidade:    z.coerce.number().nonnegative().optional(),
    valorUnitario: z.coerce.number().nonnegative().optional(),
    valorTotal:    z.coerce.number().nonnegative().optional(),
    comissao:      z.coerce.number().nonnegative().optional(),
  },
).omit({ id: true, createdAt: true });

export const updateArchMarketplacePedidoSchema = createSelectSchema(
  archMarketplacePedidosTable,
  {
    quantidade:    z.coerce.number().nonnegative().optional(),
    valorUnitario: z.coerce.number().nonnegative().optional(),
    valorTotal:    z.coerce.number().nonnegative().optional(),
    comissao:      z.coerce.number().nonnegative().optional(),
  },
)
  .omit({ id: true, compradorTenantId: true, itemId: true, createdAt: true })
  .partial();

export type InsertArchMarketplacePedido = z.infer<typeof insertArchMarketplacePedidoSchema>;
export type UpdateArchMarketplacePedido = z.infer<typeof updateArchMarketplacePedidoSchema>;
export type ArchMarketplacePedido = typeof archMarketplacePedidosTable.$inferSelect;
