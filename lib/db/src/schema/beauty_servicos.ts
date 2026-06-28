import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const beautyServicosTable = pgTable("beauty_servicos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:                   varchar("nome",                    { length: 255 }).notNull(),
  descricao:              text("descricao"),
  categoria:              varchar("categoria",               { length: 50 }),
  duracaoMinutos:         integer("duracao_minutos").notNull(),
  preco:                  numeric("preco",                   { precision: 10, scale: 2 }).notNull(),
  comissaoProfissional:   numeric("comissao_profissional",   { precision: 5,  scale: 2 }).default("0"),
  ativo:                  boolean("ativo").default(true),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
});

export const insertBeautyServicoSchema = createInsertSchema(beautyServicosTable, {
  preco:                z.coerce.number().nonnegative(),
  comissaoProfissional: z.coerce.number().nonnegative().optional(),
  duracaoMinutos:       z.coerce.number().int().positive(),
}).omit({ id: true, createdAt: true });

export const updateBeautyServicoSchema = createSelectSchema(beautyServicosTable, {
  preco:                z.coerce.number().nonnegative().optional(),
  comissaoProfissional: z.coerce.number().nonnegative().optional(),
  duracaoMinutos:       z.coerce.number().int().positive().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertBeautyServico = z.infer<typeof insertBeautyServicoSchema>;
export type UpdateBeautyServico = z.infer<typeof updateBeautyServicoSchema>;
export type BeautyServico       = typeof beautyServicosTable.$inferSelect;
