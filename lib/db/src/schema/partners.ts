import { pgTable, text, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnersTable = pgTable("partners", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // ── Campos legados (mantidos para backward compat com rotas existentes) ──
  name: text("name"),
  phone: text("phone"),
  userId: text("user_id"),
  asaasAccountId: text("asaas_account_id"),
  asaasWalletId: text("asaas_wallet_id"),

  // ── Campos da especificação Etapa 1 ──
  // tenant_id sem .references() para evitar circular dep com tenants.ts
  tenantId: text("tenant_id"),
  nomeFantasia: text("nome_fantasia").notNull().default(""),
  cnpj: text("cnpj"),
  email: text("email").notNull(),
  telefone: text("telefone"),
  cidade: text("cidade"),
  uf: text("uf"),
  licencaExclusiva: boolean("licenca_exclusiva").notNull().default(false),
  status: text("status").notNull().default("ativo"),
  nivel: integer("nivel").notNull().default(1),
  dataCadastro: timestamp("data_cadastro").notNull().defaultNow(),

  // ── Parceiros, afiliados e influenciadores ───────────────────────────────
  // Um único cadastro central suporta revendedor, representante, influenciador,
  // afiliado, indicador, agência, consultor, integrador e outros tipos.
  tipoParceiro: text("tipo_parceiro").notNull().default("revendedor"),

  // Regras comerciais são armazenadas como percentuais; valores absolutos ficam
  // restritos à liquidação financeira/split, evitando duplicidade de regra.
  comissaoPercentual: numeric("comissao_percentual", { precision: 5, scale: 2 }),
  comissaoRecorrentePercentual: numeric("comissao_recorrente_percentual", { precision: 5, scale: 2 }),

  // Cupom principal do parceiro. O código é opcional e único quando informado.
  cupomCodigo: text("cupom_codigo").unique(),
  descontoCupomPercentual: numeric("desconto_cupom_percentual", { precision: 5, scale: 2 }),
  cupomAtivo: boolean("cupom_ativo").notNull().default(false),
  cupomValidoAte: timestamp("cupom_valido_ate"),
  cupomAplicacao: text("cupom_aplicacao").notNull().default("geral"),

  // ── Auditoria ──
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({
  id: true,
  createdAt: true,
  dataCadastro: true,
  asaasAccountId: true,
  asaasWalletId: true,
});

export const updatePartnerSchema = createSelectSchema(partnersTable)
  .omit({ id: true, createdAt: true, dataCadastro: true })
  .partial();

export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
