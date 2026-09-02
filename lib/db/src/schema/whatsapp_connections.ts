import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const whatsappConnectionsTable = pgTable("whatsapp_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("meta"),
  assignedUserId: text("assigned_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  isDefault: boolean("is_default").notNull().default(false),
  label: text("label"),
  wabaId: text("waba_id"),
  phoneNumberId: text("phone_number_id"),
  businessName: text("business_name"),
  displayPhoneNumber: text("display_phone_number"),
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  evolutionInstanceName: text("evolution_instance_name"),
  status: text("status").notNull().default("active"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
});

export const insertWhatsappConnectionSchema = createInsertSchema(whatsappConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
}).omit({ id: true });

export const updateWhatsappConnectionSchema = createSelectSchema(whatsappConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertWhatsappConnection = z.infer<typeof insertWhatsappConnectionSchema>;
export type UpdateWhatsappConnection = z.infer<typeof updateWhatsappConnectionSchema>;
export type WhatsappConnection = typeof whatsappConnectionsTable.$inferSelect;
