import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const prospectorFlowsTable = pgTable("prospector_flows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  segmento: text("segmento"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProspectorFlowSchema = createInsertSchema(prospectorFlowsTable).omit({
  id: true,
  createdAt: true,
});

export const updateProspectorFlowSchema = createSelectSchema(prospectorFlowsTable)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertProspectorFlow = z.infer<typeof insertProspectorFlowSchema>;
export type ProspectorFlow = typeof prospectorFlowsTable.$inferSelect;
