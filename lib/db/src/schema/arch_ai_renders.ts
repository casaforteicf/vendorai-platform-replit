import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const archAiRendersTable = pgTable("arch_ai_renders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:         text("tenant_id").notNull(),
  leadId:           text("lead_id"),
  projectId:        text("project_id"),
  parentRenderId:   text("parent_render_id"),
  // 'preservar' = inpainting estrutural | 'criar' = geração livre
  mode:             varchar("mode", { length: 20 }).notNull().default("criar"),
  ambiente:         text("ambiente").notNull(),
  estilo:           text("estilo"),
  iluminacao:       text("iluminacao"),
  angulo:           text("angulo"),
  // Zonas selecionadas pelo usuário ex: ['piso','armario']
  maskZones:        jsonb("mask_zones").$type<string[]>(),
  maskFileUrl:      text("mask_file_url"),
  originalImageUrl: text("original_image_url"),
  resultImageUrl:   text("result_image_url"),
  // Score de confiança por zona para debug/auditoria
  segmentationConfidence: jsonb("segmentation_confidence").$type<Record<string, number>>(),
  // true = passou pelo compositing pós-geração
  composited:       boolean("composited").default(false),
  // 'fiel_ao_original' | 'conceito'
  versionTag:       varchar("version_tag", { length: 30 }),
  // 'processando' | 'concluido' | 'erro' | 'rejeitado_auto'
  status:           varchar("status", { length: 30 }).default("processando"),
  erroMsg:          text("erro_msg"),
  prompt:           text("prompt"),
  motor:            varchar("motor", { length: 50 }),
  retentativas:     varchar("retentativas", { length: 5 }).default("0"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  concluidoEm:      timestamp("concluido_em"),
});

export const insertArchAiRenderSchema = createInsertSchema(archAiRendersTable, {
  maskZones: z.array(z.string()).optional(),
  segmentationConfidence: z.record(z.string(), z.number()).optional(),
}).omit({ id: true, createdAt: true });

export const updateArchAiRenderSchema = createSelectSchema(archAiRendersTable, {
  maskZones: z.array(z.string()).optional(),
  segmentationConfidence: z.record(z.string(), z.number()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertArchAiRender = z.infer<typeof insertArchAiRenderSchema>;
export type UpdateArchAiRender = z.infer<typeof updateArchAiRenderSchema>;
export type ArchAiRender       = typeof archAiRendersTable.$inferSelect;
