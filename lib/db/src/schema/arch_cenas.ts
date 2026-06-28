import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";
import { archAmbientesTable } from "./arch_ambientes";

export const archCenasTable = pgTable("arch_cenas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projetoId: text("projeto_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id")
    .references(() => archAmbientesTable.id, { onDelete: "set null" }),
  nome:         varchar("nome",          { length: 100 }),
  sceneData:    jsonb("scene_data").$type<Record<string, unknown>>(),
  renderUrl:    varchar("render_url",    { length: 500 }),
  thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
  status:       varchar("status",        { length: 20 }).default("rascunho"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

export const insertArchCenaSchema = createInsertSchema(archCenasTable, {
  sceneData: z.record(z.string(), z.unknown()).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateArchCenaSchema = createSelectSchema(archCenasTable, {
  sceneData: z.record(z.string(), z.unknown()).optional(),
})
  .omit({ id: true, projetoId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertArchCena = z.infer<typeof insertArchCenaSchema>;
export type UpdateArchCena = z.infer<typeof updateArchCenaSchema>;
export type ArchCena = typeof archCenasTable.$inferSelect;
