import { pgTable, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const produtosCatalogoTable = pgTable("produtos_catalogo", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  categoria: text("categoria"),
  precoBase: numeric("preco_base", { precision: 12, scale: 2 }).notNull(),
  unidade: text("unidade").notNull().default("un"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProdutoCatalogoSchema = createInsertSchema(
  produtosCatalogoTable,
  {
    precoBase: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal price")),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProdutoCatalogoSchema = createSelectSchema(
  produtosCatalogoTable,
  {
    precoBase: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal price"))
      .optional(),
  }
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertProdutoCatalogo = z.infer<typeof insertProdutoCatalogoSchema>;
export type UpdateProdutoCatalogo = z.infer<typeof updateProdutoCatalogoSchema>;
export type ProdutoCatalogo = typeof produtosCatalogoTable.$inferSelect;
