import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { fretesVeiculosTable } from "./fretes_veiculos";

// status: cotacao_pendente | cotado | aprovado | coletado | em_transito |
//         entregue | cancelado
export const fretesCargaStatusEnum = pgEnum("fretes_carga_status", [
  "cotacao_pendente", "cotado", "aprovado", "coletado", "em_transito",
  "entregue", "cancelado",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const fretesCargasTable = pgTable("fretes_cargas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id").notNull().references(() => leadsTable.id, { onDelete: "restrict" }),
  veiculoId: text("veiculo_id").references(() => fretesVeiculosTable.id, { onDelete: "set null" }),
  enderecoColeta: text("endereco_coleta").notNull(),
  enderecoEntrega: text("endereco_entrega").notNull(),
  tipoCarga: text("tipo_carga"),
  pesoKg: numeric("peso_kg", { precision: 10, scale: 2 }),
  volumeM3: numeric("volume_m3", { precision: 10, scale: 2 }),
  valorCotado: numeric("valor_cotado", { precision: 12, scale: 2 }),
  status: fretesCargaStatusEnum("status").notNull().default("cotacao_pendente"),
  dataColetaPrevista: timestamp("data_coleta_prevista"),
  dataEntregaPrevista: timestamp("data_entrega_prevista"),
  dataColetaReal: timestamp("data_coleta_real"),
  dataEntregaReal: timestamp("data_entrega_real"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFretesCargaSchema = createInsertSchema(fretesCargasTable, {
  pesoKg: decimalField.optional().nullable(),
  volumeM3: decimalField.optional().nullable(),
  valorCotado: decimalField.optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateFretesCargaSchema = createSelectSchema(fretesCargasTable, {
  pesoKg: decimalField.optional().nullable(),
  volumeM3: decimalField.optional().nullable(),
  valorCotado: decimalField.optional().nullable(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type FretesCarga = typeof fretesCargasTable.$inferSelect;
export type InsertFretesCarga = z.infer<typeof insertFretesCargaSchema>;
