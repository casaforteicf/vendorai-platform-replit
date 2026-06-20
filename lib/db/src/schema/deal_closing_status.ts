import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { dealsTable } from "./deals";
import { tenantsTable } from "./tenants";

export const dealClosingStatusTable = pgTable("deal_closing_status", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => dealsTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  etapaAtual: text("etapa_atual").notNull(),
  // 'plano_atribuido' | 'contrato_pendente' | 'contrato_assinado' |
  // 'cobranca_pendente' | 'pagamento_confirmado' | 'onboarding_disparado' |
  // 'concluido' | 'travado_erro'
  contratoZapsignId: text("contrato_zapsign_id"),
  contratoStatus: text("contrato_status"), // 'enviado' | 'assinado' | 'erro'
  cobrancaAsaasId: text("cobranca_asaas_id"),
  cobrancaStatus: text("cobranca_status"), // 'criada' | 'paga' | 'vencida' | 'erro'
  ultimoErro: text("ultimo_erro"),
  tentativas: integer("tentativas").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDealClosingStatusSchema = createInsertSchema(dealClosingStatusTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateDealClosingStatusSchema = createSelectSchema(dealClosingStatusTable)
  .omit({ id: true, dealId: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertDealClosingStatus = import("zod/v4").infer<typeof insertDealClosingStatusSchema>;
export type UpdateDealClosingStatus = import("zod/v4").infer<typeof updateDealClosingStatusSchema>;
export type DealClosingStatus = typeof dealClosingStatusTable.$inferSelect;
