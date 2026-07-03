import {
  pgTable,
  text,
  real,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archProjetosTable } from "./arch_projetos";

export const arqAieSnapshotsTable = pgTable("arq_aie_snapshots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projetoId: text("projeto_id")
    .notNull()
    .references(() => archProjetosTable.id, { onDelete: "cascade" }),
  overallScore: real("overall_score"),
  renderReadinessScore: real("render_readiness_score"),
  materialScore: real("material_score"),
  consistencyScore: real("consistency_score"),
  compositionScore: real("composition_score"),
  lightingScore: real("lighting_score"),
  photographyScore: real("photography_score"),
  geometryScore: real("geometry_score"),
  promptQualityScore: real("prompt_quality_score"),
  fullResult: jsonb("full_result"),
  projectSnapshot: jsonb("project_snapshot"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertArqAieSnapshotSchema = createInsertSchema(arqAieSnapshotsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertArqAieSnapshot = z.infer<typeof insertArqAieSnapshotSchema>;
export type ArqAieSnapshot = typeof arqAieSnapshotsTable.$inferSelect;
