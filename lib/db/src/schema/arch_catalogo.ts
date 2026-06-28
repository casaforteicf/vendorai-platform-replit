import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const archCatalogoTable = pgTable("arch_catalogo", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:           varchar("nome",          { length: 255 }).notNull(),
  descricao:      text("descricao"),
  categoria:      varchar("categoria",     { length: 50  }),
  subcategoria:   varchar("subcategoria",  { length: 50  }),
  fornecedor:     varchar("fornecedor",    { length: 255 }),
  precoBase:      numeric("preco_base",    { precision: 10, scale: 2 }),
  unidade:        varchar("unidade",       { length: 20  }),
  imagens:        jsonb("imagens").$type<string[]>(),
  especificacoes: jsonb("especificacoes").$type<Record<string, unknown>>(),
  ativo:          boolean("ativo").default(true),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertArchCatalogoSchema = createInsertSchema(archCatalogoTable, {
  precoBase: z.coerce.number().nonnegative().optional(),
  imagens:   z.array(z.string()).optional(),
  especificacoes: z.record(z.string(), z.unknown()).optional(),
}).omit({ id: true, createdAt: true });

export const updateArchCatalogoSchema = createSelectSchema(archCatalogoTable, {
  precoBase: z.coerce.number().nonnegative().optional(),
  imagens:   z.array(z.string()).optional(),
  especificacoes: z.record(z.string(), z.unknown()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertArchCatalogo = z.infer<typeof insertArchCatalogoSchema>;
export type UpdateArchCatalogo = z.infer<typeof updateArchCatalogoSchema>;
export type ArchCatalogo = typeof archCatalogoTable.$inferSelect;
