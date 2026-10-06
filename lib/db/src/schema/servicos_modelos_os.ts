import { pgTable, text, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import type { ServicoCampoPersonalizado } from "./servicos_ordens";

export const servicosModelosOsTable = pgTable("servicos_modelos_os", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  modeloExecucao: varchar("modelo_execucao", { length: 40 }).notNull(),
  camposPersonalizados: jsonb("campos_personalizados")
    .$type<ServicoCampoPersonalizado[]>()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ServicosModeloOs = typeof servicosModelosOsTable.$inferSelect;
