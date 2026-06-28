import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { clinicMedicosTable } from "./clinic_medicos";
import { clinicEspecialidadesTable } from "./clinic_especialidades";

// status: agendada | confirmada | realizada | cancelada | faltou
// tipoAtendimento: presencial | telemedicina
export const clinicConsultasTable = pgTable("clinic_consultas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  pacienteId: text("paciente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  medicoId: text("medico_id")
    .notNull()
    .references(() => clinicMedicosTable.id, { onDelete: "restrict" }),
  especialidadeId: text("especialidade_id")
    .references(() => clinicEspecialidadesTable.id, { onDelete: "set null" }),
  dataHora:           timestamp("data_hora").notNull(),
  status:             varchar("status",             { length: 20  }).default("agendada"),
  tipoAtendimento:    varchar("tipo_atendimento",   { length: 20  }).default("presencial"),
  convenio:           varchar("convenio",           { length: 100 }),
  numeroCarteirinha:  varchar("numero_carteirinha", { length: 50  }),
  valor:              numeric("valor",              { precision: 10, scale: 2 }),
  lembrete1Enviado:   boolean("lembrete1_enviado").default(false),
  lembrete2Enviado:   boolean("lembrete2_enviado").default(false),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
});

export const insertClinicConsultaSchema = createInsertSchema(clinicConsultasTable, {
  valor:           z.coerce.number().nonnegative().optional(),
  status:          z.enum(["agendada", "confirmada", "realizada", "cancelada", "faltou"]).optional(),
  tipoAtendimento: z.enum(["presencial", "telemedicina"]).optional(),
}).omit({ id: true, createdAt: true });

export const updateClinicConsultaSchema = createSelectSchema(clinicConsultasTable, {
  valor:           z.coerce.number().nonnegative().optional(),
  status:          z.enum(["agendada", "confirmada", "realizada", "cancelada", "faltou"]).optional(),
  tipoAtendimento: z.enum(["presencial", "telemedicina"]).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertClinicConsulta = z.infer<typeof insertClinicConsultaSchema>;
export type UpdateClinicConsulta = z.infer<typeof updateClinicConsultaSchema>;
export type ClinicConsulta       = typeof clinicConsultasTable.$inferSelect;
