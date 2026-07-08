import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const bloqueioPeriodoEnum = pgEnum("bloqueio_periodo", [
  "dia_inteiro",
  "manha",
  "tarde",
]);

export const bloqueiosAgendaTable = pgTable("bloqueios_agenda", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  responsavelId: text("responsavel_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  dataInicio: timestamp("data_inicio").notNull(),
  dataFim: timestamp("data_fim").notNull(),
  periodo: bloqueioPeriodoEnum("periodo").notNull().default("dia_inteiro"),
  motivo: text("motivo"),
  criadoPor: text("criado_por").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBloqueioAgendaSchema = createInsertSchema(bloqueiosAgendaTable, {
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateBloqueioAgendaSchema = createSelectSchema(bloqueiosAgendaTable, {
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertBloqueioAgenda = z.infer<typeof insertBloqueioAgendaSchema>;
export type UpdateBloqueioAgenda = z.infer<typeof updateBloqueioAgendaSchema>;
export type BloqueioAgenda = typeof bloqueiosAgendaTable.$inferSelect;
