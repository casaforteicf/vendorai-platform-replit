import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const agendamentoTipoEnum = pgEnum("agendamento_tipo", [
  "reuniao",
  "visita",
  "consulta",
  "instalacao",
]);

export const agendamentoStatusEnum = pgEnum("agendamento_status", [
  "agendado",
  "confirmado",
  "concluido",
  "cancelado",
  "no_show",
]);

export const agendamentosTable = pgTable("agendamentos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, {
    onDelete: "set null",
  }),
  tipo: agendamentoTipoEnum("tipo").notNull(),
  titulo: text("titulo").notNull(),
  dataHoraInicio: timestamp("data_hora_inicio").notNull(),
  dataHoraFim: timestamp("data_hora_fim").notNull(),
  local: text("local"),
  status: agendamentoStatusEnum("status").notNull().default("agendado"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgendamentoSchema = createInsertSchema(agendamentosTable, {
  dataHoraInicio: z.coerce.date(),
  dataHoraFim: z.coerce.date(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateAgendamentoSchema = createSelectSchema(agendamentosTable, {
  dataHoraInicio: z.coerce.date().optional(),
  dataHoraFim: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertAgendamento = z.infer<typeof insertAgendamentoSchema>;
export type UpdateAgendamento = z.infer<typeof updateAgendamentoSchema>;
export type Agendamento = typeof agendamentosTable.$inferSelect;
