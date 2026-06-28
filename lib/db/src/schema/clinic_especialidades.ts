import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const clinicEspecialidadesTable = pgTable("clinic_especialidades", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:                    varchar("nome",                     { length: 100 }).notNull(),
  descricao:               text("descricao"),
  duracaoConsultaMinutos:  integer("duracao_consulta_minutos").default(30),
  valorConsulta:           numeric("valor_consulta",           { precision: 10, scale: 2 }),
  ativo:                   boolean("ativo").default(true),
});

export const insertClinicEspecialidadeSchema = createInsertSchema(clinicEspecialidadesTable, {
  valorConsulta:          z.coerce.number().nonnegative().optional(),
  duracaoConsultaMinutos: z.coerce.number().int().positive().optional(),
}).omit({ id: true });

export const updateClinicEspecialidadeSchema = createSelectSchema(clinicEspecialidadesTable, {
  valorConsulta:          z.coerce.number().nonnegative().optional(),
  duracaoConsultaMinutos: z.coerce.number().int().positive().optional(),
})
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertClinicEspecialidade = z.infer<typeof insertClinicEspecialidadeSchema>;
export type UpdateClinicEspecialidade = z.infer<typeof updateClinicEspecialidadeSchema>;
export type ClinicEspecialidade       = typeof clinicEspecialidadesTable.$inferSelect;
