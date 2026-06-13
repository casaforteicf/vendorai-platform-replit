import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const funisTable = pgTable("funis", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  etapas: jsonb("etapas").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFunilSchema = createInsertSchema(funisTable, {
  etapas: z.array(z.string()).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateFunilSchema = createSelectSchema(funisTable, {
  etapas: z.array(z.string()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertFunil = z.infer<typeof insertFunilSchema>;
export type UpdateFunil = z.infer<typeof updateFunilSchema>;
export type Funil = typeof funisTable.$inferSelect;
