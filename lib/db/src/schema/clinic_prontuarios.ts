import {
  pgTable,
  varchar,
  text,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { clinicConsultasTable } from "./clinic_consultas";

export const clinicProntuariosTable = pgTable("clinic_prontuarios", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  pacienteId: text("paciente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  consultaId: text("consulta_id")
    .references(() => clinicConsultasTable.id, { onDelete: "set null" }),
  queixaPrincipal: text("queixa_principal"),
  anamnese:        text("anamnese"),
  exame:           text("exame"),
  diagnostico:     text("diagnostico"),
  cid10:           varchar("cid10",       { length: 10 }),
  prescricao:      text("prescricao"),
  retorno:         date("retorno"),
  arquivos:        jsonb("arquivos").$type<string[]>(),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export const insertClinicProntuarioSchema = createInsertSchema(clinicProntuariosTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const updateClinicProntuarioSchema = createSelectSchema(clinicProntuariosTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertClinicProntuario = z.infer<typeof insertClinicProntuarioSchema>;
export type UpdateClinicProntuario = z.infer<typeof updateClinicProntuarioSchema>;
export type ClinicProntuario       = typeof clinicProntuariosTable.$inferSelect;
