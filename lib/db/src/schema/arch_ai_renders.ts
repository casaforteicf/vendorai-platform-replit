import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archConceptProjectsTable } from "./arch_concept_projects";

export type ArchRenderSelection = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  surfaceKey?: string;
};

export const archAiRendersTable = pgTable("arch_ai_renders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:         text("tenant_id").notNull(),
  leadId:           text("lead_id"),
  projectId:        text("project_id"),
  // Pré-projeto Arqdor (Concept) pode renderizar antes de ser promovido a arch_projetos.
  conceptProjectId: text("concept_project_id").references(() => archConceptProjectsTable.id, { onDelete: "set null" }),
  // Internal durable input and lease. Never serialize these fields to clients.
  jobInput:         jsonb("job_input").$type<Record<string, unknown>>(),
  jobLeaseToken:    text("job_lease_token"),
  jobLeaseUntil:    timestamp("job_lease_until", { withTimezone: true }),
  jobAttempts:      integer("job_attempts").notNull().default(0),
  providerPredictionId: text("provider_prediction_id"),
  providerSubmissionStartedAt: timestamp("provider_submission_started_at", { withTimezone: true }),
  source:           varchar("source", { length: 20 }),
  renderView:       varchar("render_view", { length: 20 }),
  // Proveniência técnica: qual revisão/cena/câmera originou esta imagem.
  projectRevision:  text("project_revision"),
  sceneId:          text("scene_id"),
  sceneName:        text("scene_name"),
  cameraSnapshot:   jsonb("camera_snapshot").$type<{
    floor?: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }>(),
  sourceModelVersion: text("source_model_version"),
  isPrimary:        boolean("is_primary").notNull().default(false),
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
}, (table) => ({
  conceptPrimaryIdx: uniqueIndex("arch_ai_renders_concept_primary_idx").on(table.tenantId, table.conceptProjectId)
    .where(sql`${table.isPrimary} = true AND ${table.conceptProjectId} IS NOT NULL`),
  regenerationKeyIdx: uniqueIndex("arch_ai_renders_regeneration_key_idx").on(table.tenantId, sql`(${table.jobInput}->>'regenerationKey')`)
    .where(sql`${table.jobInput}->>'regenerationKey' IS NOT NULL`),
  conceptHistoryIdx: index("arch_ai_renders_tenant_concept_created_idx").on(table.tenantId, table.conceptProjectId, table.createdAt),
}));

export const insertArchAiRenderSchema = createInsertSchema(archAiRendersTable, {
  maskZones: z.array(z.string()).optional(),
  selectionMetadata: z.array(z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    label: z.string().optional(),
    surfaceKey: z.string().optional(),
  })).optional(),
  segmentationConfidence: z.record(z.string(), z.number()).optional(),
  cameraSnapshot: z.object({
    floor: z.number().int().optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    target: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }).optional(),
}).omit({ id: true, createdAt: true, isPrimary: true, jobInput: true, jobLeaseToken: true, jobLeaseUntil: true, jobAttempts: true, providerPredictionId: true, providerSubmissionStartedAt: true });

export const updateArchAiRenderSchema = createSelectSchema(archAiRendersTable, {
  maskZones: z.array(z.string()).optional(),
  selectionMetadata: z.array(z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    label: z.string().optional(),
    surfaceKey: z.string().optional(),
  })).optional(),
  segmentationConfidence: z.record(z.string(), z.number()).optional(),
  cameraSnapshot: z.object({
    floor: z.number().int().optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    target: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, isPrimary: true, jobInput: true, jobLeaseToken: true, jobLeaseUntil: true, jobAttempts: true, providerPredictionId: true, providerSubmissionStartedAt: true })
  .partial();

export type InsertArchAiRender = z.infer<typeof insertArchAiRenderSchema>;
export type UpdateArchAiRender = z.infer<typeof updateArchAiRenderSchema>;
export type ArchAiRender       = typeof archAiRendersTable.$inferSelect;


