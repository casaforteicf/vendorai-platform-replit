import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const whatsappContactsTable = pgTable("whatsapp_contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  name: text("name"),
  profilePicture: text("profile_picture"),
  firstMessageAt: timestamp("first_message_at"),
  lastMessageAt: timestamp("last_message_at"),
  tags: text("tags"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWhatsappContactSchema = createInsertSchema(whatsappContactsTable, {
  firstMessageAt: z.coerce.date().optional(),
  lastMessageAt: z.coerce.date().optional(),
  createdAt: z.coerce.date().optional(),
}).omit({ id: true });

export const updateWhatsappContactSchema = createSelectSchema(whatsappContactsTable, {
  firstMessageAt: z.coerce.date().optional(),
  lastMessageAt: z.coerce.date().optional(),
  createdAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertWhatsappContact = z.infer<typeof insertWhatsappContactSchema>;
export type UpdateWhatsappContact = z.infer<typeof updateWhatsappContactSchema>;
export type WhatsappContact = typeof whatsappContactsTable.$inferSelect;
