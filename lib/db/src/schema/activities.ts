import { pgTable, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";
import { agendasTable } from "./agendas";

export const activityTipoEnum = pgEnum("activity_tipo", [
  "ligacao",
  "whatsapp",
  "email",
  "visita",
  "tarefa",
  "reuniao",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "pendente",
  "concluida",
  "cancelada",
  "planejado",
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
  resultadoExecucao: text("resultado_execucao"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  // Reunião online
  agendaId: text("agenda_id").references(() => agendasTable.id, { onDelete: "set null" }),
  dataHoraInicio: timestamp("data_hora_inicio"),
  dataHoraFim: timestamp("data_hora_fim"),
  gerarMeet: boolean("gerar_meet").default(false),
  googleEventId: text("google_event_id"),
  meetLink: text("meet_link"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activitiesTable, {
  dataVencimento: z.coerce.date().optional(),
  concluidaEm: z.coerce.date().optional(),
  dataHoraInicio: z.coerce.date().optional(),
  dataHoraFim: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, googleEventId: true, meetLink: true });

export const updateActivitySchema = createSelectSchema(activitiesTable, {
  dataVencimento: z.coerce.date().optional(),
  concluidaEm: z.coerce.date().optional(),
  dataHoraInicio: z.coerce.date().optional(),
  dataHoraFim: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
