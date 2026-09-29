import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  jsonb,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { archCatalogoTable } from "./arch_catalogo";
import { produtosCatalogoTable } from "./produtos_catalogo";

export const archMaterialsTable = pgTable("arch_materials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerTenantId: text("owner_tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  masterKey: text("master_key").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  fabricante: varchar("fabricante", { length: 255 }).notNull(),
  linha: varchar("linha", { length: 255 }).notNull(),
  referencia: varchar("referencia", { length: 255 }),
  categoria: varchar("categoria", { length: 80 }).notNull(),
  subcategoria: varchar("subcategoria", { length: 80 }),
  cor: varchar("cor", { length: 120 }),
  acabamento: varchar("acabamento", { length: 120 }),
  aplicacao: varchar("aplicacao", { length: 255 }),
  escalaLarguraMm: numeric("escala_largura_mm", { precision: 12, scale: 2 }),
  escalaAlturaMm: numeric("escala_altura_mm", { precision: 12, scale: 2 }),
  compartilhamento: varchar("compartilhamento", { length: 20 }).notNull().default("privado"),
  status: varchar("status", { length: 30 }).notNull().default("cadastrado"),
  primaryImageId: text("primary_image_id"),
  especificacoes: jsonb("especificacoes").$type<Record<string, unknown>>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  masterKeyUnique: uniqueIndex("arch_materials_master_key_uidx").on(table.masterKey),
}));

export const archMaterialImagesTable = pgTable("arch_material_images", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  materialId: text("material_id")
    .notNull()
    .references(() => archMaterialsTable.id, { onDelete: "cascade" }),
  contributorTenantId: text("contributor_tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  storageUrl: text("storage_url").notNull(),
  originalFilename: text("original_filename"),
  mimeType: varchar("mime_type", { length: 100 }),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("ativa"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const archMaterialTenantAccessTable = pgTable("arch_material_tenant_access", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  materialId: text("material_id")
    .notNull()
    .references(() => archMaterialsTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("linked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantMaterialUnique: uniqueIndex("arch_material_tenant_access_uidx").on(table.materialId, table.tenantId),
}));

export const archCatalogProductMaterialsTable = pgTable("arch_catalog_product_materials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  // Legado: vínculo antigo com arch_catalogo. Mantido durante a transição.
  productId: text("product_id")
    .references(() => archCatalogoTable.id, { onDelete: "cascade" }),
  // Fonte oficial: o mesmo produto mestre de produtos_catalogo usado pelo comercial.
  masterProductId: text("master_product_id")
    .references(() => produtosCatalogoTable.id, { onDelete: "cascade" }),
  materialId: text("material_id")
    .notNull()
    .references(() => archMaterialsTable.id, { onDelete: "cascade" }),
  surfaceKey: varchar("surface_key", { length: 120 }),
  grupo: varchar("grupo", { length: 120 }),
  isDefault: boolean("is_default").notNull().default(false),
  precoAdicional: numeric("preco_adicional", { precision: 10, scale: 2 }),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  productMaterialSurfaceUnique: uniqueIndex("arch_catalog_product_materials_uidx").on(
    table.tenantId,
    table.productId,
    table.materialId,
    table.surfaceKey,
  ),
}));

export const insertArchMaterialSchema = createInsertSchema(archMaterialsTable, {
  compartilhamento: z.enum(["privado", "parceiros", "publico"]).default("privado"),
  status: z.enum(["cadastrado", "em_analise", "aprovado", "pronto_render"]).default("cadastrado"),
  escalaLarguraMm: z.coerce.number().positive().optional(),
  escalaAlturaMm: z.coerce.number().positive().optional(),
  especificacoes: z.record(z.string(), z.unknown()).optional(),
}).omit({ id: true, masterKey: true, primaryImageId: true, createdAt: true, updatedAt: true });

export const updateArchMaterialSchema = createSelectSchema(archMaterialsTable, {
  compartilhamento: z.enum(["privado", "parceiros", "publico"]).optional(),
  status: z.enum(["cadastrado", "em_analise", "aprovado", "pronto_render"]).optional(),
  escalaLarguraMm: z.coerce.number().positive().optional(),
  escalaAlturaMm: z.coerce.number().positive().optional(),
  especificacoes: z.record(z.string(), z.unknown()).optional(),
})
  .omit({ id: true, ownerTenantId: true, masterKey: true, primaryImageId: true, createdAt: true, updatedAt: true })
  .partial();

export const insertArchCatalogProductMaterialSchema = createInsertSchema(archCatalogProductMaterialsTable, {
  precoAdicional: z.coerce.number().nonnegative().optional(),
}).omit({ id: true, tenantId: true, productId: true, masterProductId: true, createdAt: true });

export type ArchMaterial = typeof archMaterialsTable.$inferSelect;
export type ArchMaterialImage = typeof archMaterialImagesTable.$inferSelect;
export type ArchCatalogProductMaterial = typeof archCatalogProductMaterialsTable.$inferSelect;
