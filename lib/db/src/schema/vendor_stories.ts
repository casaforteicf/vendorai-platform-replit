import { pgTable, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

export const STORY_MEDIA_TYPES = ["foto", "video"] as const;
export type StoryMediaType = typeof STORY_MEDIA_TYPES[number];

// Stories do parceiro (Complemento Praça.ai) — foto/vídeo efêmero postado
// pelo lojista aqui no Vendor.ai, exibido tipo Instagram Stories na home do
// Praça.ai. Expira sozinho em 24h (expiresAt), independente de remoção
// manual (ativo=false). produtoId e linkUrl são mutuamente opcionais — o
// story pode linkar pra um produto do catálogo OU pra uma URL livre
// (ex: carrinho, WhatsApp), nunca os dois.
export const vendorStoriesTable = pgTable(
  "vendor_stories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    mediaType: text("media_type").$type<StoryMediaType>().notNull(),
    mediaUrl: text("media_url").notNull(),
    produtoId: text("produto_id").references(() => produtosCatalogoTable.id, { onDelete: "set null" }),
    linkUrl: text("link_url"),
    caption: text("caption"),
    viewsCount: integer("views_count").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendor_stories_tenant_idx").on(table.tenantId, table.createdAt),
  ],
);

export const insertVendorStorySchema = createInsertSchema(vendorStoriesTable, { mediaType: z.enum(["foto", "video"]) })
  .omit({ id: true, viewsCount: true, ativo: true, createdAt: true, expiresAt: true })
  // No insert, o front nunca escolhe os dois — reforça a regra de negócio
  // (produtoId OU linkUrl, nunca ambos) direto no schema de validação.
  .refine((data) => !(data.produtoId && data.linkUrl), {
    message: "Escolha um produto OU um link, não os dois.",
  });

export type InsertVendorStory = z.infer<typeof insertVendorStorySchema>;
export type VendorStory = typeof vendorStoriesTable.$inferSelect;
