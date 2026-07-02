import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const sdrTemplatesTable = pgTable("sdr_templates", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId:    text("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  cenario:     text("cenario").notNull(),
  ordem:       integer("ordem").default(1).notNull(),
  delayHoras:  integer("delay_horas").default(0).notNull(),
  template:    text("template").notNull(),
  ativo:       boolean("ativo").default(true).notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSdrTemplateSchema = createInsertSchema(sdrTemplatesTable);
export const selectSdrTemplateSchema = createSelectSchema(sdrTemplatesTable);

export type SdrTemplate    = typeof sdrTemplatesTable.$inferSelect;
export type InsertSdrTemplate = z.infer<typeof insertSdrTemplateSchema>;
