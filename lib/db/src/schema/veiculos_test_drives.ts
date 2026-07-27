import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { usersTable } from "./users";
import { veiculosEstoqueTable } from "./veiculos_estoque";

export const veiculosTestDriveStatusEnum = pgEnum("veiculos_test_drive_status", [
  "agendado", "confirmado", "realizado", "cancelado",
]);

export const veiculosTestDrivesTable = pgTable("veiculos_test_drives", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  veiculoId: text("veiculo_id").notNull().references(() => veiculosEstoqueTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id").notNull().references(() => leadsTable.id, { onDelete: "restrict" }),
  vendedorId: text("vendedor_id").references(() => usersTable.id, { onDelete: "set null" }),
  dataHora: timestamp("data_hora").notNull(),
  status: veiculosTestDriveStatusEnum("status").notNull().default("agendado"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVeiculosTestDriveSchema = createInsertSchema(veiculosTestDrivesTable).omit({
  id: true, createdAt: true,
});

export const updateVeiculosTestDriveSchema = createSelectSchema(veiculosTestDrivesTable).omit({
  id: true, tenantId: true, createdAt: true,
}).partial();

export type VeiculosTestDrive = typeof veiculosTestDrivesTable.$inferSelect;
export type InsertVeiculosTestDrive = z.infer<typeof insertVeiculosTestDriveSchema>;
