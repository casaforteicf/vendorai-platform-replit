import { pgTable, text, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const conversationsTable = pgTable("conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, {
    onDelete: "set null",
  }),
  channel: text("channel"),
  status: text("status").notNull().default("open"),
  agentName: text("agent_name"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(
  conversationsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateConversationSchema = createSelectSchema(conversationsTable)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type UpdateConversation = z.infer<typeof updateConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
