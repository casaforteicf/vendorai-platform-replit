import { pgTable, text, timestamp, boolean, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const supermercadoCampanhaTipoEnum = pgEnum("supermercado_campanha_tipo", [
  "promocao", "receita", "dica", "lugar", "historia", "data_comemorativa", "reativacao",
]);

export const supermercadoCampanhaStatusEnum = pgEnum("supermercado_campanha_status", [
  "rascunho", "agendada", "enviando", "concluida", "pausada",
]);

export const supermercadoCampanhaEnvioStatusEnum = pgEnum("supermercado_campanha_envio_status", [
  "pendente", "enviado", "falhou",
]);

export const supermercadoCampanhaTable = pgTable("supermercado_campanhas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  tipo: supermercadoCampanhaTipoEnum("tipo").notNull(),
  status: supermercadoCampanhaStatusEnum("status").notNull().default("rascunho"),
  conteudo: text("conteudo").notNull(),
  imagemUrl: text("imagem_url"),
  publicarNoPraca: boolean("publicar_no_praca").notNull().default(false),
  resumoPraca: text("resumo_praca"),
  passosPraca: jsonb("passos_praca").$type<string[]>().notNull().default([]),
  produtoIdsPraca: jsonb("produto_ids_praca").$type<string[]>().notNull().default([]),
  publicacaoPracaEm: timestamp("publicacao_praca_em"),
  ofertaPracaEm: timestamp("oferta_praca_em"),
  ofertaTituloPraca: text("oferta_titulo_praca"),
  ofertaResumoPraca: text("oferta_resumo_praca"),
  agendadoPara: timestamp("agendado_para"),
  enviadoEm: timestamp("enviado_em"),
  totalEnviados: integer("total_enviados").notNull().default(0),
  totalFalhas: integer("total_falhas").notNull().default(0),
  geradoPorIa: boolean("gerado_por_ia").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supermercadoCampanhaEnvioTable = pgTable("supermercado_campanha_envios", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campanhaId: text("campanha_id").notNull().references(() => supermercadoCampanhaTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  telefone: text("telefone").notNull(),
  status: supermercadoCampanhaEnvioStatusEnum("status").notNull().default("pendente"),
  erroMsg: text("erro_msg"),
  enviadoEm: timestamp("enviado_em"),
});

export const insertSupermercadoCampanhaSchema = createInsertSchema(supermercadoCampanhaTable).omit({
  id: true, createdAt: true, updatedAt: true, totalEnviados: true, totalFalhas: true,
});

export const updateSupermercadoCampanhaSchema = createSelectSchema(supermercadoCampanhaTable).omit({
  id: true, tenantId: true, createdAt: true, updatedAt: true,
}).partial();

export type SupermercadoCampanha = typeof supermercadoCampanhaTable.$inferSelect;
export type SupermercadoCampanhaEnvio = typeof supermercadoCampanhaEnvioTable.$inferSelect;
export type InsertSupermercadoCampanha = z.infer<typeof insertSupermercadoCampanhaSchema>;
