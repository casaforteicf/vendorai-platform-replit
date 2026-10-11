import { pgTable, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";
import { leadsTable } from "./leads";
import { propostasTable } from "./propostas";
import { usersTable } from "./users";

export type OperationalChecklistItemStatus =
  | "nao_conferido"
  | "conferido"
  | "divergente"
  | "nao_executado"
  | "resolvido";

export type OperationalChecklistItem = {
  id: string;
  sourceItemIndex: number;
  codigo?: string | null;
  tipo?: string | null;
  descricao: string;
  quantidade: number;
  larguraOriginal?: number | null;
  alturaOriginal?: number | null;
  larguraConferida?: number | null;
  alturaConferida?: number | null;
  diferencaLargura?: number | null;
  diferencaAltura?: number | null;
  unidadeMedida?: string | null;
  localizacao?: string | null;
  observacao?: string | null;
  atributosTecnicos?: Record<string, unknown>;
  imagemUrl?: string | null;
  fotos?: string[];
  photoMeasurements?: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number }; millimeters: number; label: string; photoPath?: string; source: "manual_verified" }>;
  status: OperationalChecklistItemStatus;
  conferidoPor?: string | null;
  conferidoEm?: string | null;
};

export const operationalChecklistTemplatesTable = pgTable("operational_checklist_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  key: text("key").notNull(),
  stageKey: text("stage_key").notNull(),
  sourceType: text("source_type").notNull().default("proposal"),
  toleranceMm: integer("tolerance_mm").notNull().default(3),
  requirePhotos: boolean("require_photos").notNull().default(false),
  blockOnDivergence: boolean("block_on_divergence").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const operationalChecklistRunsTable = pgTable("operational_checklist_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  templateId: text("template_id").references(() => operationalChecklistTemplatesTable.id, { onDelete: "set null" }),
  dealId: text("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  propostaId: text("proposta_id").references(() => propostasTable.id, { onDelete: "set null" }),
  stageKey: text("stage_key").notNull(),
  name: text("name").notNull(),
  revision: integer("revision").notNull().default(1),
  status: text("status").notNull().default("em_andamento"),
  headerSnapshot: jsonb("header_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  items: jsonb("items").$type<OperationalChecklistItem[]>().notNull().default([]),
  toleranceMm: integer("tolerance_mm").notNull().default(3),
  blockOnDivergence: boolean("block_on_divergence").notNull().default(true),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  completedBy: text("completed_by").references(() => usersTable.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OperationalChecklistTemplate = typeof operationalChecklistTemplatesTable.$inferSelect;
export type OperationalChecklistRun = typeof operationalChecklistRunsTable.$inferSelect;
