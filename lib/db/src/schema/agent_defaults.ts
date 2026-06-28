import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AGENT_KEYS = [
  "sdr",
  "closer",
  "financeiro",
  "cobranca",
  "suporte",
  "agendamento",
  "pos_venda",
  "prospector",
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const agentDefaultsTable = pgTable("agent_defaults", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentKey: text("agent_key").notNull().unique(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  categoria: text("categoria"),
  systemPromptBase: text("system_prompt_base").notNull(),
  parametrosBase: jsonb("parametros_base").$type<Record<string, unknown>>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAgentDefaultSchema = createInsertSchema(agentDefaultsTable).omit({
  id: true,
  createdAt: true,
});

export const selectAgentDefaultSchema = createSelectSchema(agentDefaultsTable);

export type InsertAgentDefault = z.infer<typeof insertAgentDefaultSchema>;
export type AgentDefault = typeof agentDefaultsTable.$inferSelect;
