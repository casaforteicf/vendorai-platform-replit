import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const activityTipoEnum = pgEnum("activity_tipo", [
  "ligacao",
  "whatsapp",
  "email",
  "visita",
  "tarefa",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "pendente",
  "concluida",
  "cancelada",
]);

export const activitiesTable = pgTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  tipo: activityTipoEnum("tipo").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  status: activityStatusEnum("status").notNull().default("pendente"),
  dataVencimento: timestamp("data_vencimento"),
  concluidaEm: timestamp("concluida_em"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activitiesTable, {
  dataVencimento: z.coerce.date().optional(),
  concluidaEm: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateActivitySchema = createSelectSchema(activitiesTable, {
  dataVencimento: z.coerce.date().optional(),
  concluidaEm: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
