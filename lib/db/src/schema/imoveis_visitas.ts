import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { usersTable } from "./users";
import { imoveisPropriedadesTable } from "./imoveis_propriedades";

export const imoveisVisitaStatusEnum = pgEnum("imoveis_visita_status", [
  "agendada", "confirmada", "realizada", "cancelada",
]);

export const imoveisVisitasTable = pgTable("imoveis_visitas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  propriedadeId: text("propriedade_id").notNull().references(() => imoveisPropriedadesTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id").notNull().references(() => leadsTable.id, { onDelete: "restrict" }),
  corretorId: text("corretor_id").references(() => usersTable.id, { onDelete: "set null" }),
  dataHora: timestamp("data_hora").notNull(),
  status: imoveisVisitaStatusEnum("status").notNull().default("agendada"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertImoveisVisitaSchema = createInsertSchema(imoveisVisitasTable).omit({
  id: true, createdAt: true,
});

export const updateImoveisVisitaSchema = createSelectSchema(imoveisVisitasTable).omit({
  id: true, tenantId: true, createdAt: true,
}).partial();

export type ImoveisVisita = typeof imoveisVisitasTable.$inferSelect;
export type InsertImoveisVisita = z.infer<typeof insertImoveisVisitaSchema>;
