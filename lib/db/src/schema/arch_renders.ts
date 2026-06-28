import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archCenasTable } from "./arch_cenas";

export const archRendersTable = pgTable("arch_renders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cenaId: text("cena_id")
    .notNull()
    .references(() => archCenasTable.id, { onDelete: "cascade" }),
  blenderJobId:   varchar("blender_job_id", { length: 100 }),
  status:         varchar("status",         { length: 20  }).default("aguardando"),
  imageUrl:       varchar("image_url",      { length: 500 }),
  resolucao:      varchar("resolucao",      { length: 20  }).default("1920x1080"),
  tempoRenderMs:  integer("tempo_render_ms"),
  erroMsg:        text("erro_msg"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertArchRenderSchema = createInsertSchema(archRendersTable)
  .omit({ id: true, createdAt: true });

export const updateArchRenderSchema = createSelectSchema(archRendersTable)
  .omit({ id: true, cenaId: true, createdAt: true })
  .partial();

export type InsertArchRender = z.infer<typeof insertArchRenderSchema>;
export type UpdateArchRender = z.infer<typeof updateArchRenderSchema>;
export type ArchRender = typeof archRendersTable.$inferSelect;
