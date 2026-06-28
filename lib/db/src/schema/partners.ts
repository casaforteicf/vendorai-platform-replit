import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
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
