// Histórico de revisões de orçamento — controle simples, manual, de cada
// rodada de negociação de um orçamento (não confundir com a tabela
// `propostas`, que são os orçamentos/propostas completos gerados pelo
// sistema). Fica na tela do Lead/negócio pra registrar: número do
// orçamento naquela revisão, data, como foi apresentado, e observação —
// permanece como histórico permanente do atendimento.
import { pgTable, text, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const orcamentoRevisaoAnexoSchema = z.object({
  nome: z.string(),
  url: z.string(),
  mimeType: z.string().optional(),
  tamanho: z.number().optional(),
});
export type OrcamentoRevisaoAnexo = z.infer<typeof orcamentoRevisaoAnexoSchema>;

export const orcamentoRevisoesTable = pgTable("orcamento_revisoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  numeroOrcamento: text("numero_orcamento").notNull(),
  dataOrcamento: date("data_orcamento").notNull(),
  apresentacao: text("apresentacao"),
  observacao: text("observacao"),
  anexos: jsonb("anexos").$type<OrcamentoRevisaoAnexo[]>().notNull().default([]),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrcamentoRevisaoSchema = createInsertSchema(orcamentoRevisoesTable, {
  anexos: z.array(orcamentoRevisaoAnexoSchema).optional(),
}).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const updateOrcamentoRevisaoSchema = createSelectSchema(orcamentoRevisoesTable, {
  anexos: z.array(orcamentoRevisaoAnexoSchema).optional(),
})
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type OrcamentoRevisao = typeof orcamentoRevisoesTable.$inferSelect;
export type NewOrcamentoRevisao = typeof orcamentoRevisoesTable.$inferInsert;
