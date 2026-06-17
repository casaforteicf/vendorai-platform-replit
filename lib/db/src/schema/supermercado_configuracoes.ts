import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const supermercadoConfigTable = pgTable("supermercado_configuracoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().unique().references(() => tenantsTable.id, { onDelete: "cascade" }),

  // ERP integration
  erpApiUrl: text("erp_api_url"),
  erpApiKey: text("erp_api_key"),
  erpSyncEnabled: boolean("erp_sync_enabled").notNull().default(false),

  // WhatsApp bot settings
  zapiInstanceId: text("zapi_instance_id"),
  zapiToken: text("zapi_token"),
  botAtivo: boolean("bot_ativo").notNull().default(false),
  mensagemBoasVindas: text("mensagem_boas_vindas"),

  // Automation: campaigns
  campanhasAtivas: boolean("campanhas_ativas").notNull().default(true),
  contatosPorRodada: integer("contatos_por_rodada").notNull().default(50),
  diasSemana: text("dias_semana").array(), // e.g. ['segunda', 'quarta', 'sexta']
  horarioEnvio: text("horario_envio").notNull().default("09:00"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupermercadoConfigSchema = createInsertSchema(supermercadoConfigTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const updateSupermercadoConfigSchema = createSelectSchema(supermercadoConfigTable).omit({
  id: true, tenantId: true, createdAt: true, updatedAt: true,
}).partial();

export type SupermercadoConfig = typeof supermercadoConfigTable.$inferSelect;
export type InsertSupermercadoConfig = z.infer<typeof insertSupermercadoConfigSchema>;
