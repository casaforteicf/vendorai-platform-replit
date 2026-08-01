import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { SERVICOS_ESPECIALIDADES } from "./servicos_prestadores";

export const servicosTiposTable = pgTable("servicos_tipos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:                varchar("nome", { length: 255 }).notNull(),
  descricao:           text("descricao"),
  categoria:            varchar("categoria", { length: 80 }).notNull().default("Outros"),
  especialidade:       varchar("especialidade", { length: 80 }).notNull().default("geral"),
  // Preço nulo é comum aqui — muitos serviços só têm preço definido após a
  // visita técnica (diferente de beauty/clinic, onde o preço é fixo por tipo).
  precoBase:           numeric("preco_base", { precision: 10, scale: 2 }),
  requerVisitaTecnica: boolean("requer_visita_tecnica").default(true),
  ativo:               boolean("ativo").default(true),
  vendeNoPracaAi:      boolean("vende_no_praca_ai").notNull().default(false),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
});

export const insertServicosTipoSchema = createInsertSchema(servicosTiposTable, {
  precoBase: z.coerce.number().nonnegative().optional().nullable(),
  categoria: z.string().min(1).max(80).optional(),
  especialidade: z.string().min(1).max(80).optional(),
}).omit({ id: true, createdAt: true });

export const updateServicosTipoSchema = createSelectSchema(servicosTiposTable, {
  precoBase: z.coerce.number().nonnegative().optional().nullable(),
  categoria: z.string().min(1).max(80).optional(),
  especialidade: z.string().min(1).max(80).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertServicosTipo = z.infer<typeof insertServicosTipoSchema>;
export type UpdateServicosTipo = z.infer<typeof updateServicosTipoSchema>;
export type ServicosTipo       = typeof servicosTiposTable.$inferSelect;
