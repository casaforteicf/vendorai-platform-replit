import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { socialConnectionsTable } from "./social_connections";

export const socialPublicationsTable = pgTable("social_publications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").references(() => socialConnectionsTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  externalId: text("external_id"),
  contentType: text("content_type").notNull().default("post"),
  text: text("text"),
  mediaUrl: text("media_url"),
  status: text("status").notNull().default("draft"),
  metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SocialPublication = typeof socialPublicationsTable.$inferSelect;

