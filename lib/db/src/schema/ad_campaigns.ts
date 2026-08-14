import { pgTable, text, timestamp, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

// Módulo de anúncios — cross-vertical (produto/veículo/imóvel), começando
// pelo Google (Search RSA + Performance Max), com plataforma já modelada
// pra Meta/TikTok/LinkedIn entrarem depois sem precisar de nova migration
// no núcleo da tabela.
export const adPlataformaEnum = pgEnum("ad_plataforma", ["google", "meta", "tiktok", "linkedin"]);
export const adTipoAnuncioEnum = pgEnum("ad_tipo_anuncio", ["shopping", "rsa_pmax"]);
export const adItemTipoEnum = pgEnum("ad_item_tipo", ["produto", "veiculo", "imovel"]);
export const adModoEnum = pgEnum("ad_modo", ["unico", "carrossel"]);
export const adCampanhaStatusEnum = pgEnum("ad_campanha_status", [
  "rascunho", "aguardando_conexao_plataforma", "ativo", "pausado", "encerrado",
]);
export const adCriativoStatusEnum = pgEnum("ad_criativo_status", ["rascunho", "aprovado"]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const adCampaignsTable = pgTable("ad_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  plataforma: adPlataformaEnum("plataforma").notNull().default("google"),
  tipoAnuncio: adTipoAnuncioEnum("tipo_anuncio").notNull(),
  vertical: text("vertical").notNull(),
  itemTipo: adItemTipoEnum("item_tipo").notNull(),
  // Nulo quando modo='carrossel' com alvo de categoria inteira
  itemId: text("item_id"),
  // Só no modo carrossel: categoria/segmento pra puxar itens relacionados
  categoriaFiltro: text("categoria_filtro"),
  modo: adModoEnum("modo").notNull().default("unico"),
  orcamentoDiario: numeric("orcamento_diario", { precision: 10, scale: 2 }).notNull(),
  status: adCampanhaStatusEnum("status").notNull().default("rascunho"),
  // Só preenchido depois de publicar de verdade na plataforma (resource
  // name/campaign id retornado pela API)
  externalCampaignId: text("external_campaign_id"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const adCreativesTable = pgTable("ad_creatives", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  // RSA do Google aceita até 15 títulos / 4 descrições — array cabe isso e
  // as variações de outras plataformas no futuro
  headlines: jsonb("headlines").$type<string[]>().notNull().default([]),
  descriptions: jsonb("descriptions").$type<string[]>().notNull().default([]),
  imagens: jsonb("imagens").$type<string[]>().notNull().default([]),
  status: adCriativoStatusEnum("status").notNull().default("rascunho"),
  geradoEm: timestamp("gerado_em").notNull().defaultNow(),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em"),
});

export const insertAdCampaignSchema = createInsertSchema(adCampaignsTable, {
  orcamentoDiario: decimalField,
}).omit({ id: true, createdAt: true, updatedAt: true, externalCampaignId: true, status: true });

export const updateAdCampaignSchema = createSelectSchema(adCampaignsTable, {
  orcamentoDiario: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type AdCampaign = typeof adCampaignsTable.$inferSelect;
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;
export type AdCreative = typeof adCreativesTable.$inferSelect;
