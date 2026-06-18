import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  connectionId: text("connection_id"),
  externalMessageId: text("external_message_id"),
  contactPhone: text("contact_phone"),
  contactName: text("contact_name"),
  direction: text("direction"),
  type: text("type"),
  content: text("content"),
  mediaUrl: text("media_url"),
  status: text("status").notNull().default("pending"),
  timestamp: timestamp("timestamp"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessagesTable, {
  timestamp: z.coerce.date().optional(),
  createdAt: z.coerce.date().optional(),
}).omit({ id: true });

export const updateWhatsappMessageSchema = createSelectSchema(whatsappMessagesTable, {
  timestamp: z.coerce.date().optional(),
  createdAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type UpdateWhatsappMessage = z.infer<typeof updateWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessagesTable.$inferSelect;
