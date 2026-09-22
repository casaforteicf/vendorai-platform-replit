import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type InternalKnowledgeModule = {
  id: string;
  group: string;
  title: string;
  summary: string;
  bullets: string[];
  angle: string;
};

export const adminInternalKnowledgeSegmentsTable = pgTable("admin_internal_knowledge_segments", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  modules: jsonb("modules").$type<InternalKnowledgeModule[]>().notNull().default([]),
  isCustom: boolean("is_custom").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AdminInternalKnowledgeSegment = typeof adminInternalKnowledgeSegmentsTable.$inferSelect;
