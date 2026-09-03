import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const CONTENT_TYPES = ["feed", "stories", "reels", "linkedin", "youtube"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export type FeedVariation = { caption: string; hashtags: string[]; imageUrl?: string; imageUrls?: string[] };
export type StoriesVariation = { text: string; cta: string; imageUrl?: string; imageUrls?: string[] };
export type ReelsScene = { visual: string; fala: string; duracao: string };
export type ReelsVariation = {
  title: string;
  scenes: ReelsScene[];
  audioSuggestion: string;
  cta: string;
  videoUrl?: string;
};
export type LinkedInVariation = { hook: string; caption: string; hashtags: string[] };
export type YouTubeScriptBlock = { bloco: string; conteudo: string };
export type YouTubeVariation = { titulo: string; descricao: string; tags: string[]; roteiro: YouTubeScriptBlock[] };
export type ContentVariation = FeedVariation | StoriesVariation | ReelsVariation | LinkedInVariation | YouTubeVariation;
export type ContentGenerationResult = { variations: ContentVariation[] };

export const CONTENT_FORMATS = ["feed_square", "feed_portrait", "stories", "reels"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const contentGenerationsTable = pgTable("content_generations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  productId: text("product_id"),
  productName: text("product_name"),
  theme: text("theme").notNull(),
  contentFormat: text("content_format").$type<ContentFormat>(),
  aspectRatio: text("aspect_ratio"),
  result: jsonb("result").$type<ContentGenerationResult>().notNull().default({ variations: [] }),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContentGenerationSchema = createInsertSchema(contentGenerationsTable, {
  type: z.enum(CONTENT_TYPES),
}).omit({ id: true, createdAt: true });

export const selectContentGenerationSchema = createSelectSchema(contentGenerationsTable, {
  type: z.enum(CONTENT_TYPES),
});

export type InsertContentGeneration = z.infer<typeof insertContentGenerationSchema>;
export type ContentGeneration = typeof contentGenerationsTable.$inferSelect;