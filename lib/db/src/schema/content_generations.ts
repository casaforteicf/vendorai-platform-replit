import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const CONTENT_TYPES = ["feed", "stories", "reels"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export type FeedVariation = { caption: string; hashtags: string[]; imageUrl?: string };
export type StoriesVariation = { text: string; cta: string; imageUrl?: string };
export type ReelsScene = { visual: string; fala: string; duracao: string };
export type ReelsVariation = {
  title: string;
  scenes: ReelsScene[];
  audioSuggestion: string;
  cta: string;
  videoUrl?: string;
};
export type ContentVariation = FeedVariation | StoriesVariation | ReelsVariation;
export type ContentGenerationResult = { variations: ContentVariation[] };

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
  result: jsonb("result").$type<ContentGenerationResult>().notNull().default({ variations: [] }),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContentGenerationSchema = createInsertSchema(contentGenerationsTable, {
  type: z.enum(["feed", "stories", "reels"]),
}).omit({ id: true, createdAt: true });

export const selectContentGenerationSchema = createSelectSchema(contentGenerationsTable, {
  type: z.enum(["feed", "stories", "reels"]),
});

export type InsertContentGeneration = z.infer<typeof insertContentGenerationSchema>;
export type ContentGeneration = typeof contentGenerationsTable.$inferSelect;
