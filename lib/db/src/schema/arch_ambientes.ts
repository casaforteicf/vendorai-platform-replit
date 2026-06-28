import {
  pgTable,
  varchar,
  text,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";

export const archAmbientesTable = pgTable("arch_ambientes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projetoId: text("projeto_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  nome:      varchar("nome",   { length: 100 }),
  areaM2:    numeric("area_m2", { precision: 6, scale: 2 }),
  descricao: text("descricao"),
  ordem:     integer("ordem").default(0),
});

export const insertArchAmbienteSchema = createInsertSchema(archAmbientesTable, {
  areaM2: z.coerce.number().nonnegative().optional(),
}).omit({ id: true });

export const updateArchAmbienteSchema = createSelectSchema(archAmbientesTable, {
  areaM2: z.coerce.number().nonnegative().optional(),
})
  .omit({ id: true, projetoId: true })
  .partial();

export type InsertArchAmbiente = z.infer<typeof insertArchAmbienteSchema>;
export type UpdateArchAmbiente = z.infer<typeof updateArchAmbienteSchema>;
export type ArchAmbiente = typeof archAmbientesTable.$inferSelect;
