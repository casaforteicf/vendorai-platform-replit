import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ArchRenderSelection = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

export const archAiRendersTable = pgTable("arch_ai_renders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:         text("tenant_id").notNull(),
  leadId:           text("lead_id"),
  projectId:        text("project_id"),
  conceptProjectId: text("concept_project_id"),
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
  // Metadados imutáveis da versão. O navegador pode manter cache, mas o banco
  // é a fonte oficial para reconstruir V1/V2/V3 após refresh ou troca de sessão.
  operationType:    varchar("operation_type", { length: 30 }).default("initial"),
  materialId:       text("material_id"),
  materialName:     text("material_name"),
  selectionMetadata: jsonb("selection_metadata").$type<ArchRenderSelection[]>(),
  originalImageUrl: text("original_image_url"),
  resultImageUrl:   text("result_image_url"),
  // Score de confiança por zona para debug/auditoria
  segmentationConfidence: jsonb("segmentation_confidence").$type<Record<string, number>>(),
  // true = passou pelo compositing pós-geração
  composited:       boolean("composited").default(false),
  // 'fiel_ao_original' | 'conceito' | 'aprovado'
  versionTag:       varchar("version_tag", { length: 30 }),
  // 'processando' | 'concluido' | 'erro' | 'rejeitado_auto'
  status:           varchar("status", { length: 30 }).default("processando"),
  erroMsg:          text("erro_msg"),
  prompt:           text("prompt"),
  motor:            varchar("motor", { length: 50 }),
  // Estimativa em USD por geração; nullable para motores/execuções sem medição.
  costEstimateUsd:  numeric("cost_estimate_usd", { precision: 12, scale: 6 }),
  retentativas:     varchar("retentativas", { length: 5 }).default("0"),
  // Aprovação real vem do usuário autenticado, nunca do nome enviado pelo body.
  approvedBy:       text("approved_by"),
  approvedAt:       timestamp("approved_at"),
  approvalNote:     text("approval_note"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  concluidoEm:      timestamp("concluido_em"),
});

export const insertArchAiRenderSchema = createInsertSchema(archAiRendersTable, {
  maskZones: z.array(z.string()).optional(),
  selectionMetadata: z.array(z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    label: z.string().optional(),
  })).optional(),
  segmentationConfidence: z.record(z.string(), z.number()).optional(),
}).omit({ id: true, createdAt: true });

export const updateArchAiRenderSchema = createSelectSchema(archAiRendersTable, {
  maskZones: z.array(z.string()).optional(),
  selectionMetadata: z.array(z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    label: z.string().optional(),
  })).optional(),
  segmentationConfidence: z.record(z.string(), z.number()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertArchAiRender = z.infer<typeof insertArchAiRenderSchema>;
export type UpdateArchAiRender = z.infer<typeof updateArchAiRenderSchema>;
export type ArchAiRender       = typeof archAiRendersTable.$inferSelect;
