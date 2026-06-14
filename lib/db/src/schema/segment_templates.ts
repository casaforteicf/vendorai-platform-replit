import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const promptsSugeridosSchema = z.object({
  sdr:          z.string().optional(),
  closer:       z.string().optional(),
  followup:     z.string().optional(),
  reactivation: z.string().optional(),
  scheduler:    z.string().optional(),
  service:      z.string().optional(),
  onboarding:   z.string().optional(),
});
export type PromptsSugeridos = z.infer<typeof promptsSugeridosSchema>;

export const segmentTemplatesTable = pgTable("segment_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  promptsSugeridos: jsonb("prompts_sugeridos")
    .$type<PromptsSugeridos>()
    .notNull()
    .default({}),
  funilPadrao: jsonb("funil_padrao")
    .$type<string[]>()
    .notNull()
    .default([]),
  categoriasProdutoSugeridas: jsonb("categorias_produto_sugeridas")
    .$type<string[]>()
    .notNull()
    .default([]),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSegmentTemplateSchema = createInsertSchema(segmentTemplatesTable, {
  promptsSugeridos: promptsSugeridosSchema.optional(),
  funilPadrao: z.array(z.string()).optional(),
  categoriasProdutoSugeridas: z.array(z.string()).optional(),
}).omit({ id: true, createdAt: true });

export const updateSegmentTemplateSchema = createSelectSchema(segmentTemplatesTable, {
  promptsSugeridos: promptsSugeridosSchema.optional(),
  funilPadrao: z.array(z.string()).optional(),
  categoriasProdutoSugeridas: z.array(z.string()).optional(),
})
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertSegmentTemplate = z.infer<typeof insertSegmentTemplateSchema>;
export type UpdateSegmentTemplate = z.infer<typeof updateSegmentTemplateSchema>;
export type SegmentTemplate = typeof segmentTemplatesTable.$inferSelect;
