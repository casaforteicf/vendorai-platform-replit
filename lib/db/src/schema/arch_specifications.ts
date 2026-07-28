import { pgTable, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ─── arch_specifications ──────────────────────────────────────────────────────
// Uma especificação por render/projeto. Contém os itens identificados pela IA.

export const archSpecificationsTable = pgTable("arch_specifications", {
  id:             text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId:       text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projetoId:      text("projeto_id").notNull(),
  renderId:       text("render_id"),
  renderImageUrl: text("render_image_url"),
  status:         text("status").notNull().default("draft"),       // draft | complete
  itemsCount:     integer("items_count").default(0),
  specifiedCount: integer("specified_count").default(0),
  // Medidas do ambiente/cômodo — preenchidas manualmente pelo usuário (não
  // estimadas por IA a partir da foto, que não é confiável pra medida real).
  areaM2:         numeric("area_m2", { precision: 8, scale: 2 }),
  peDireitoM:     numeric("pe_direito_m", { precision: 5, scale: 2 }),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// ─── arch_spec_items ──────────────────────────────────────────────────────────
// Cada item identificado no render pela IA.

export const archSpecItemsTable = pgTable("arch_spec_items", {
  id:                 text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  specificationId:    text("specification_id").notNull().references(() => archSpecificationsTable.id, { onDelete: "cascade" }),
  categoria:          text("categoria").notNull(),
  descricao:          text("descricao").notNull(),
  quantidade:         integer("quantidade").default(1),
  confianca:          numeric("confianca", { precision: 3, scale: 2 }).default("0.80"),
  status:             text("status").notNull().default("pendente"),  // pendente | especificado | nao_especificado
  catalogoItemId:     text("catalogo_item_id"),
  overrideNome:       text("override_nome"),
  overrideFornecedor: text("override_fornecedor"),
  overridePreco:      numeric("override_preco", { precision: 10, scale: 2 }),
  // Dimensões do item — preenchidas manualmente (não estimadas por IA).
  larguraCm:          numeric("largura_cm", { precision: 8, scale: 1 }),
  alturaCm:           numeric("altura_cm", { precision: 8, scale: 1 }),
  profundidadeCm:     numeric("profundidade_cm", { precision: 8, scale: 1 }),
  notes:              text("notes"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const insertArchSpecificationSchema = createInsertSchema(archSpecificationsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const updateArchSpecificationSchema = createSelectSchema(archSpecificationsTable, {
  areaM2: z.coerce.number().nonnegative().transform((v) => String(v)).optional().nullable(),
  peDireitoM: z.coerce.number().nonnegative().transform((v) => String(v)).optional().nullable(),
})
  .omit({ id: true, tenantId: true, projetoId: true, createdAt: true, updatedAt: true })
  .partial();

export const insertArchSpecItemSchema = createInsertSchema(archSpecItemsTable)
  .omit({ id: true, createdAt: true });

export const updateArchSpecItemSchema = createSelectSchema(archSpecItemsTable, {
  larguraCm: z.coerce.number().nonnegative().transform((v) => String(v)).optional().nullable(),
  alturaCm: z.coerce.number().nonnegative().transform((v) => String(v)).optional().nullable(),
  profundidadeCm: z.coerce.number().nonnegative().transform((v) => String(v)).optional().nullable(),
})
  .omit({ id: true, specificationId: true, createdAt: true })
  .partial();

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArchSpecification   = typeof archSpecificationsTable.$inferSelect;
export type ArchSpecItem        = typeof archSpecItemsTable.$inferSelect;
export type InsertArchSpecification = z.infer<typeof insertArchSpecificationSchema>;
export type UpdateArchSpecification = z.infer<typeof updateArchSpecificationSchema>;
export type InsertArchSpecItem      = z.infer<typeof insertArchSpecItemSchema>;
export type UpdateArchSpecItem      = z.infer<typeof updateArchSpecItemSchema>;
