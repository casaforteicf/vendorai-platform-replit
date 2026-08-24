// Etapas do pipeline de negócios, configuráveis por tenant. As 11
// etapas do sistema (antigo enum de deals.etapa) existem como linhas
// isSystem=true — protegidas contra exclusão/troca de key (automação
// de contrato/cobrança em vários pontos do backend depende do valor
// exato), mas label/cor/SLA são editáveis pelo admin. Etapas novas
// (isSystem=false) são só organizacionais, sem automação nenhuma
// amarrada — o admin do tenant pode criar quantas quiser.
import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  color: text("color"),
  bg: text("bg"),
  ordem: integer("ordem").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  // Minutos que um deal pode ficar nesta etapa antes do card ficar
  // vermelho no Kanban. Null = sem SLA (nunca fica vermelho).
  slaMinutos: integer("sla_minutos"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const updatePipelineStageSchema = createSelectSchema(pipelineStagesTable)
  .omit({ id: true, tenantId: true, key: true, isSystem: true, createdAt: true, updatedAt: true })
  .partial();

export type PipelineStage = typeof pipelineStagesTable.$inferSelect;
export type NewPipelineStage = typeof pipelineStagesTable.$inferInsert;

// As 11 etapas do sistema (mesmos valores do antigo dealEtapaEnum) —
// usado pra semear tenants que ainda não têm nenhuma etapa configurada.
// Mesmas labels/cores que já existiam hardcoded em Deals.tsx (ETAPAS).
export const SYSTEM_PIPELINE_STAGES: Array<{ key: string; label: string; color: string; bg: string; ordem: number }> = [
  { key: "em_aquecimento",      label: "Em Aquecimento", color: "text-orange-600",  bg: "bg-orange-100",  ordem: 0 },
  { key: "novo",                label: "Novo",           color: "text-slate-600",   bg: "bg-slate-100",   ordem: 1 },
  { key: "qualificado",         label: "Qualificado",    color: "text-blue-600",    bg: "bg-blue-100",    ordem: 2 },
  { key: "proposta",            label: "Orçamento",      color: "text-violet-600",  bg: "bg-violet-100",  ordem: 3 },
  { key: "negociacao",          label: "Negociação",     color: "text-amber-600",   bg: "bg-amber-100",   ordem: 4 },
  { key: "conferencia_estoque", label: "Conf. Estoque",  color: "text-indigo-600",  bg: "bg-indigo-100",  ordem: 5 },
  { key: "ganho",                label: "Ganho",          color: "text-emerald-600", bg: "bg-emerald-100", ordem: 6 },
  { key: "em_execucao",         label: "Em Execução",    color: "text-cyan-600",    bg: "bg-cyan-100",    ordem: 7 },
  { key: "entregue",             label: "Entregue",       color: "text-teal-600",    bg: "bg-teal-100",    ordem: 8 },
  { key: "perdido",              label: "Perdido",        color: "text-red-600",     bg: "bg-red-100",     ordem: 9 },
  { key: "parceiro",             label: "Parceiros",      color: "text-purple-600",  bg: "bg-purple-100",  ordem: 10 },
];
