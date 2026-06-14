import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const siteTemplateEnum = pgEnum("site_template", [
  "padrao",
  "moderno",
  "minimalista",
]);

export const siteConfigTable = pgTable("site_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .unique()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  template: siteTemplateEnum("template").notNull().default("padrao"),
  corPrimaria: text("cor_primaria"),
  tagline: text("tagline"),
  sobreEmpresa: text("sobre_empresa"),
  whatsappContato: text("whatsapp_contato"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSiteConfigSchema = createInsertSchema(siteConfigTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSiteConfigSchema = createSelectSchema(siteConfigTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertSiteConfig = z.infer<typeof insertSiteConfigSchema>;
export type UpdateSiteConfig = z.infer<typeof updateSiteConfigSchema>;
export type SiteConfig = typeof siteConfigTable.$inferSelect;
