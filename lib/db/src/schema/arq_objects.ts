import {
  pgTable,
  text,
  real,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";

export const arqObjectsTable = pgTable("arq_objects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projetoId: text("projeto_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  objectClientId: text("object_client_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  material: text("material"),
  finish: text("finish"),
  color: text("color"),
  dimensions: jsonb("dimensions").$type<{
    width: number;
    height: number;
    depth: number;
    unit: string;
  }>(),
  position: jsonb("position").$type<{
    x: number;
    y: number;
    z: number;
    rotationDeg?: number;
    floor?: number;
  }>(),
  visualWeight: real("visual_weight"),
  designIntent: jsonb("design_intent").$type<string[]>(),
  componentId: text("component_id"),
  manufacturerId: text("manufacturer_id"),
  locked: boolean("locked").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertArqObjectSchema = createInsertSchema(arqObjectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateArqObjectSchema = createSelectSchema(arqObjectsTable)
  .omit({ id: true, projetoId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertArqObject = z.infer<typeof insertArqObjectSchema>;
export type UpdateArqObject = z.infer<typeof updateArqObjectSchema>;
export type ArqObject = typeof arqObjectsTable.$inferSelect;
