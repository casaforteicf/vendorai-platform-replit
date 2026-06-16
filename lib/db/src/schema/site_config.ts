import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ── Generated content shape ────────────────────────────────────────────────────
export interface SiteServico {
  titulo: string;
  descricao: string;
  emoji: string;
}
export interface SiteDiferencial {
  titulo: string;
  texto: string;
  icone: string;
}
export interface SiteDepoimento {
  nome: string;
  cargo: string;
  empresa: string;
  texto: string;
  estrelas: number;
}
export interface SiteFaq {
  pergunta: string;
  resposta: string;
}
export interface GeneratedSiteContent {
  hero: { headline: string; subheadline: string; cta: string; cta2?: string };
  sobre: { titulo: string; texto: string };
  servicos: SiteServico[];
  diferenciais: SiteDiferencial[];
  depoimentos: SiteDepoimento[];
  faq: SiteFaq[];
  cta_final: { titulo: string; texto: string; botao: string };
  cores: { primaria: string; secundaria: string; acento: string };
  ecommerce?: {
    titulo: string;
    descricao: string;
    frete: string;
    pagamento: string;
    garantia: string;
  };
  imageKeyword: string;
  slogan: string;
}

// ── Table ──────────────────────────────────────────────────────────────────────
export const siteConfigTable = pgTable("site_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .unique()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("landing_page"),
  template: text("template").notNull().default("padrao"),
  corPrimaria: text("cor_primaria"),
  tagline: text("tagline"),
  sobreEmpresa: text("sobre_empresa"),
  whatsappContato: text("whatsapp_contato"),
  ativo: boolean("ativo").notNull().default(true),
  status: text("status").notNull().default("draft"),
  generatedContent: jsonb("generated_content").$type<GeneratedSiteContent>(),
  heroImageUrl: text("hero_image_url"),
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
