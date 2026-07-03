import {
  pgTable,
  text,
  real,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";

export const arqMaterialsTable = pgTable("arq_materials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projetoId: text("projeto_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  materialClientId: text("material_client_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  manufacturer: text("manufacturer").notNull().default(""),
  finish: text("finish").notNull().default(""),
  gloss: real("gloss").default(0),
  palette: jsonb("palette").$type<string[]>(),
  usedByObjects: jsonb("used_by_objects").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertArqMaterialSchema = createInsertSchema(arqMaterialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateArqMaterialSchema = createSelectSchema(arqMaterialsTable)
  .omit({ id: true, projetoId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertArqMaterial = z.infer<typeof insertArqMaterialSchema>;
export type UpdateArqMaterial = z.infer<typeof updateArqMaterialSchema>;
export type ArqMaterial = typeof arqMaterialsTable.$inferSelect;
