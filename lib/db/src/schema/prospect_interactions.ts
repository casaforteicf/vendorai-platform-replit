import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { prospectsTable } from "./prospects";
import { contentLibraryTable } from "./content_library";

export const prospectInteractionDirectionEnum = ["inbound", "outbound", "system"] as const;
export const prospectInteractionChannelEnum = ["whatsapp", "email", "phone", "instagram", "system"] as const;
export const prospectInteractionStatusEnum = ["planned", "sent", "delivered", "read", "replied", "failed", "skipped"] as const;

export const prospectInteractionsTable = pgTable("prospect_interactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  prospectId: text("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  personId: text("person_id"),
  direction: text("direction").$type<typeof prospectInteractionDirectionEnum[number]>().notNull(),
  channel: text("channel").$type<typeof prospectInteractionChannelEnum[number]>().notNull(),
  status: text("status").$type<typeof prospectInteractionStatusEnum[number]>().notNull().default("planned"),
  content: text("content"),
  subject: text("subject"),
  externalId: text("external_id"),
  materialId: text("material_id").references(() => contentLibraryTable.id, { onDelete: "set null" }),
  objective: text("objective"),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantProspectIdx: index("prospect_interactions_tenant_prospect_idx").on(table.tenantId, table.prospectId, table.occurredAt),
  scheduledIdx: index("prospect_interactions_scheduled_idx").on(table.tenantId, table.status, table.scheduledAt),
}));

export const insertProspectInteractionSchema = createInsertSchema(prospectInteractionsTable, {
  direction: z.enum(prospectInteractionDirectionEnum),
  channel: z.enum(prospectInteractionChannelEnum),
  status: z.enum(prospectInteractionStatusEnum).optional(),
}).omit({ id: true, createdAt: true });

export const updateProspectInteractionSchema = createSelectSchema(prospectInteractionsTable).partial().omit({
  id: true, tenantId: true, prospectId: true, createdAt: true,
});

export type ProspectInteraction = typeof prospectInteractionsTable.$inferSelect;
export type InsertProspectInteraction = z.infer<typeof insertProspectInteractionSchema>;
