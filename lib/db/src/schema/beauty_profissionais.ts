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

export const beautyProfissionaisTable = pgTable("beauty_profissionais", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:           varchar("nome",      { length: 255 }).notNull(),
  email:          varchar("email",     { length: 255 }),
  telefone:       varchar("telefone",  { length: 20  }),
  especialidades: jsonb("especialidades").$type<string[]>(),
  comissaoBase:   numeric("comissao_base", { precision: 5, scale: 2 }).default("40"),
  ativo:          boolean("ativo").default(true),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertBeautyProfissionalSchema = createInsertSchema(beautyProfissionaisTable, {
  comissaoBase: z.coerce.number().nonnegative().optional(),
}).omit({ id: true, createdAt: true });

export const updateBeautyProfissionalSchema = createSelectSchema(beautyProfissionaisTable, {
  comissaoBase: z.coerce.number().nonnegative().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertBeautyProfissional = z.infer<typeof insertBeautyProfissionalSchema>;
export type UpdateBeautyProfissional = z.infer<typeof updateBeautyProfissionalSchema>;
export type BeautyProfissional       = typeof beautyProfissionaisTable.$inferSelect;
