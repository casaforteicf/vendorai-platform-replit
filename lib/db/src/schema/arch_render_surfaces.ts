import {
  pgTable,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";
import { usersTable } from "./users";

export const renderSurfacesTable = pgTable("render_surfaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  category:     text("category").notNull(),
  label:        text("label").notNull(),
  maskPath:     text("mask_path").notNull(),
  displayOrder: integer("display_order").default(0),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export const renderSurfaceMaterialsTable = pgTable("render_surface_materials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  surfaceId: text("surface_id")
    .notNull()
    .references(() => renderSurfacesTable.id, { onDelete: "cascade" }),
  materialName:           text("material_name").notNull(),
  materialPromptFragment: text("material_prompt_fragment"),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  appliedBy: text("applied_by")
    .references(() => usersTable.id, { onDelete: "set null" }),
});

export const insertRenderSurfaceSchema = createInsertSchema(renderSurfacesTable)
  .omit({ id: true, createdAt: true });

export const updateRenderSurfaceSchema = createSelectSchema(renderSurfacesTable)
  .omit({ id: true, projectId: true, createdAt: true })
  .partial();

export const insertRenderSurfaceMaterialSchema = createInsertSchema(renderSurfaceMaterialsTable)
  .omit({ id: true, appliedAt: true });

export type InsertRenderSurface = z.infer<typeof insertRenderSurfaceSchema>;
export type UpdateRenderSurface = z.infer<typeof updateRenderSurfaceSchema>;
export type RenderSurface = typeof renderSurfacesTable.$inferSelect;
export type InsertRenderSurfaceMaterial = z.infer<typeof insertRenderSurfaceMaterialSchema>;
export type RenderSurfaceMaterial = typeof renderSurfaceMaterialsTable.$inferSelect;
