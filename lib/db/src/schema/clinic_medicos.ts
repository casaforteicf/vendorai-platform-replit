import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { clinicEspecialidadesTable } from "./clinic_especialidades";

export const clinicMedicosTable = pgTable("clinic_medicos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:           varchar("nome",      { length: 255 }).notNull(),
  crm:            varchar("crm",       { length: 30  }),
  especialidadeId: text("especialidade_id")
    .references(() => clinicEspecialidadesTable.id, { onDelete: "set null" }),
  email:          varchar("email",     { length: 255 }),
  telefone:       varchar("telefone",  { length: 20  }),
  ativo:          boolean("ativo").default(true),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertClinicMedicoSchema = createInsertSchema(clinicMedicosTable)
  .omit({ id: true, createdAt: true });

export const updateClinicMedicoSchema = createSelectSchema(clinicMedicosTable)
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertClinicMedico = z.infer<typeof insertClinicMedicoSchema>;
export type UpdateClinicMedico = z.infer<typeof updateClinicMedicoSchema>;
export type ClinicMedico       = typeof clinicMedicosTable.$inferSelect;
