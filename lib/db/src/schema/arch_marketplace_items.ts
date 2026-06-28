import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const archMarketplaceItemsTable = pgTable("arch_marketplace_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  vendedorTenantId: text("vendedor_tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:              varchar("nome",               { length: 255 }).notNull(),
  descricao:         text("descricao"),
  categoria:         varchar("categoria",          { length: 50  }),
  preco:             numeric("preco",              { precision: 10, scale: 2 }),
  comissaoVendorai:  numeric("comissao_vendorai",  { precision: 5,  scale: 2 }).default("10"),
  imagens:           jsonb("imagens").$type<string[]>(),
  especificacoes:    jsonb("especificacoes").$type<Record<string, unknown>>(),
  ativo:             boolean("ativo").default(true),
  totalVendas:       integer("total_vendas").default(0),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
});

export const insertArchMarketplaceItemSchema = createInsertSchema(
  archMarketplaceItemsTable,
  {
    preco:            z.coerce.number().nonnegative().optional(),
    comissaoVendorai: z.coerce.number().nonnegative().optional(),
    imagens:          z.array(z.string()).optional(),
    especificacoes:   z.record(z.string(), z.unknown()).optional(),
  },
).omit({ id: true, totalVendas: true, createdAt: true });

export const updateArchMarketplaceItemSchema = createSelectSchema(
  archMarketplaceItemsTable,
  {
    preco:            z.coerce.number().nonnegative().optional(),
    comissaoVendorai: z.coerce.number().nonnegative().optional(),
    imagens:          z.array(z.string()).optional(),
    especificacoes:   z.record(z.string(), z.unknown()).optional(),
  },
)
  .omit({ id: true, vendedorTenantId: true, createdAt: true })
  .partial();

export type InsertArchMarketplaceItem = z.infer<typeof insertArchMarketplaceItemSchema>;
export type UpdateArchMarketplaceItem = z.infer<typeof updateArchMarketplaceItemSchema>;
export type ArchMarketplaceItem = typeof archMarketplaceItemsTable.$inferSelect;
