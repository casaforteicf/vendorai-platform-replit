import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archCenasTable } from "./arch_cenas";

export const archRenderVersoesTable = pgTable("arch_render_versoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cenaId: text("cena_id")
    .notNull()
    .references(() => archCenasTable.id, { onDelete: "cascade" }),
  versao:   integer("versao").notNull().default(1),
  imageUrl: varchar("image_url", { length: 500 }).notNull(),
  prompt:   text("prompt"),
  sceneData: jsonb("scene_data").$type<Record<string, unknown>>(),
  // 'original' = render inicial | 'solicitacao' = gerado a partir de solicitação do cliente
  origem:   varchar("origem", { length: 20 }).default("original"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertArchRenderVersaoSchema = createInsertSchema(archRenderVersoesTable, {
  sceneData: z.record(z.string(), z.unknown()).optional(),
}).omit({ id: true, createdAt: true });

export const updateArchRenderVersaoSchema = createSelectSchema(archRenderVersoesTable, {
  sceneData: z.record(z.string(), z.unknown()).optional(),
})
  .omit({ id: true, cenaId: true, createdAt: true })
  .partial();

export type InsertArchRenderVersao = z.infer<typeof insertArchRenderVersaoSchema>;
export type UpdateArchRenderVersao = z.infer<typeof updateArchRenderVersaoSchema>;
export type ArchRenderVersao = typeof archRenderVersoesTable.$inferSelect;
