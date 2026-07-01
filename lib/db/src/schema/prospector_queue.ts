import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const prospectorQueueStatusEnum = ["pendente", "importado", "duplicado", "abordado"] as const;
export type ProspectorQueueStatus = typeof prospectorQueueStatusEnum[number];

export const prospectorQueueTable = pgTable("prospector_queue", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .references(() => leadsTable.id, { onDelete: "set null" }),
  placeId: text("place_id").notNull(),
  nome: text("nome").notNull(),
  telefone: text("telefone"),
  endereco: text("endereco"),
  setor: text("setor"),
  cidade: text("cidade"),
  website: text("website"),
  status: text("status")
    .$type<ProspectorQueueStatus>()
    .notNull()
    .default("pendente"),
  dadosCompletos: boolean("dados_completos").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProspectorQueueSchema = createInsertSchema(prospectorQueueTable, {
  status: z.enum(prospectorQueueStatusEnum).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProspectorQueueSchema = createSelectSchema(prospectorQueueTable).partial().omit({
  id: true, tenantId: true, placeId: true, createdAt: true, updatedAt: true,
});

export type ProspectorQueue = typeof prospectorQueueTable.$inferSelect;
export type InsertProspectorQueue = z.infer<typeof insertProspectorQueueSchema>;
export type UpdateProspectorQueue = z.infer<typeof updateProspectorQueueSchema>;
