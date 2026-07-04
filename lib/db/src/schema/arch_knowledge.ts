import {
  pgTable,
  text,
  integer,
  real,
  numeric,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ─── Knowledge Entry (one per project) ───────────────────────────────────────
// Snapshot de conhecimento extraído de cada projeto ao ser processado.
// É o coração do Knowledge Engine — alimenta dashboard, padrões, ranking e sugestões.
export const archKnowledgeEntriesTable = pgTable(
  "arch_knowledge_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId:       text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    projectId:      text("project_id").notNull(),

    // Project metadata
    titulo:         text("titulo"),
    tipo:           text("tipo"),            // tipoObra: residencial, comercial…
    areaM2:         numeric("area_m2",       { precision: 8,  scale: 2 }),
    orcamentoTotal: numeric("orcamento_total",{ precision: 12, scale: 2 }),
    status:         text("status"),

    // Auto-generated tags (tipo_obra, porte, padrao, materiais…)
    tags:           jsonb("tags").$type<string[]>(),

    // Materials extracted from arch_catalogo (tenant-level)
    materiaisUsados:jsonb("materiais_usados").$type<
      { nome: string; categoria: string | null; fornecedor: string | null }[]
    >(),

    // Fabricantes from arch_orcamento_itens
    fabricantes:    jsonb("fabricantes").$type<string[]>(),

    // Components from arch_orcamento_itens
    componentes:    jsonb("componentes").$type<
      { descricao: string; categoria: string | null; fornecedor: string | null }[]
    >(),

    // Prompts from arch_prompt_variations
    promptsUsados:  jsonb("prompts_usados").$type<string[]>(),

    // Render stats
    renderCount:      integer("render_count").default(0),
    rendersAprovados: integer("renders_aprovados").default(0),
    cenasCount:       integer("cenas_count").default(0),
    revisoes:         integer("revisoes").default(0),

    snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
    createdAt:  timestamp("created_at").notNull().defaultNow(),
    updatedAt:  timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("arch_knowledge_entries_project_unique").on(t.projectId)],
);

// ─── Knowledge Tag Index (per tenant) ────────────────────────────────────────
// Frequência agregada de tags geradas automaticamente dos projetos do tenant.
// Usado para tag cloud, padrões e sugestões.
export const archKnowledgeTagsTable = pgTable("arch_knowledge_tags", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  tag:      text("tag").notNull(),
  tipo:     text("tipo").notNull().default("geral"), // estilo|material|fabricante|tipo_obra|porte|padrao
  count:    integer("count").notNull().default(1),
  score:    real("score").notNull().default(0.5),    // relevance score 0–1
  createdAt:timestamp("created_at").notNull().defaultNow(),
  updatedAt:timestamp("updated_at").notNull().defaultNow(),
});

// ─── Schemas ──────────────────────────────────────────────────────────────────
export const insertArchKnowledgeEntrySchema = createInsertSchema(
  archKnowledgeEntriesTable,
  {
    tags:            z.array(z.string()).optional(),
    materiaisUsados: z.array(z.object({ nome: z.string(), categoria: z.string().nullable(), fornecedor: z.string().nullable() })).optional(),
    fabricantes:     z.array(z.string()).optional(),
    componentes:     z.array(z.object({ descricao: z.string(), categoria: z.string().nullable(), fornecedor: z.string().nullable() })).optional(),
    promptsUsados:   z.array(z.string()).optional(),
  },
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertArchKnowledgeEntry = z.infer<typeof insertArchKnowledgeEntrySchema>;
export type ArchKnowledgeEntry       = typeof archKnowledgeEntriesTable.$inferSelect;
export type ArchKnowledgeTag         = typeof archKnowledgeTagsTable.$inferSelect;
