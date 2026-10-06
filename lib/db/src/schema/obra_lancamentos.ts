[Reading 51 lines from start (total: 51 lines, 0 remaining)]

import { pgTable, text, timestamp, numeric, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { obrasTable, obraEtapasTable } from "./obras";
import { tenantsTable } from "./tenants";

export const obraLancamentosTable = pgTable("obra_lancamentos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id")
    .notNull()
    .references(() => obrasTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("outros"),
  fornecedor: text("fornecedor"),
  numero: text("numero"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  dataEmissao: date("data_emissao", { mode: "string" }),
  dataVencimento: date("data_vencimento", { mode: "string" }),
  descricao: text("descricao"),
  status: text("status").notNull().default("pendente"),
  etapaId: text("etapa_id").references(() => obraEtapasTable.id, { onDelete: "set null" }),
  documentoUrl: text("documento_url"),
  asaasPaymentId: text("asaas_payment_id"),
  observacoes: text("observacoes"),
  visibleToClient: boolean("visible_to_client").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .optional();

export const insertObraLancamentoSchema = createInsertSchema(obraLancamentosTable, {
  valor: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraLancamentoSchema = createSelectSchema(obraLancamentosTable, {
  valor: decimalOptional,
})
  .omit({ id: true, obraId: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertObraLancamento = z.infer<typeof insertObraLancamentoSchema>;
export type UpdateObraLancamento = z.infer<typeof updateObraLancamentoSchema>;
export type ObraLancamento = typeof obraLancamentosTable.$inferSelect;
