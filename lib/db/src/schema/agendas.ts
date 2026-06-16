import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const agendasTable = pgTable("agendas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  cor: text("cor").notNull().default("#3B82F6"),
  isDefault: boolean("is_default").notNull().default(false),
  googleCalendarId: text("google_calendar_id"),
  googleEmail: text("google_email"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgendaSchema = createInsertSchema(agendasTable, {
  cor: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  googleAccessToken: true,
  googleRefreshToken: true,
  googleTokenExpiresAt: true,
  googleCalendarId: true,
  googleEmail: true,
});

export const updateAgendaSchema = createSelectSchema(agendasTable)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
    googleAccessToken: true,
    googleRefreshToken: true,
    googleTokenExpiresAt: true,
  })
  .partial();

export type InsertAgenda = z.infer<typeof insertAgendaSchema>;
export type UpdateAgenda = z.infer<typeof updateAgendaSchema>;
export type Agenda = typeof agendasTable.$inferSelect;
