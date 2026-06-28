import {
  pgTable,
  varchar,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const clinicConveniosTable = pgTable("clinic_convenios", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:       varchar("nome",        { length: 255 }).notNull(),
  codigoAns:  varchar("codigo_ans",  { length: 20  }),
  contato:    varchar("contato",     { length: 255 }),
  ativo:      boolean("ativo").default(true),
});

export const insertClinicConvenioSchema = createInsertSchema(clinicConveniosTable)
  .omit({ id: true });

export const updateClinicConvenioSchema = createSelectSchema(clinicConveniosTable)
  .omit({ id: true, tenantId: true })
  .partial();

export type InsertClinicConvenio = z.infer<typeof insertClinicConvenioSchema>;
export type UpdateClinicConvenio = z.infer<typeof updateClinicConvenioSchema>;
export type ClinicConvenio       = typeof clinicConveniosTable.$inferSelect;
