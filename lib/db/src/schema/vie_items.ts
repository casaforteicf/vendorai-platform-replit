import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { vieSourcesTable } from "./vie_sources";

export const vieItemsTable = pgTable("vie_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceId: text("source_id").notNull().references(() => vieSourcesTable.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  externalId: text("external_id"),
  title: text("title").notNull(),
  url: text("url").notNull(),
  excerpt: text("excerpt"),
  author: text("author"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  categories: jsonb("categories").$type<string[] | null>(),
  rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown> | null>(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  sourceFingerprintUnique: uniqueIndex("vie_items_source_fingerprint_idx").on(table.sourceId, table.fingerprint),
  publishedIdx: index("vie_items_published_idx").on(table.publishedAt),
  sourcePublishedIdx: index("vie_items_source_published_idx").on(table.sourceId, table.publishedAt),
}));
