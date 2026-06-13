import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { conversationsTable } from "./conversations";
import { leadsTable } from "./leads";

export const messageDirecaoEnum = pgEnum("message_direcao", [
  "entrada",
  "saida",
]);

export const messageCanalEnum = pgEnum("message_canal", [
  "whatsapp",
  "instagram",
  "email",
  "chat",
]);

export const messageTipoConteudoEnum = pgEnum("message_tipo_conteudo", [
  "texto",
  "imagem",
  "audio",
  "documento",
]);

export const messageEnviadoPorEnum = pgEnum("message_enviado_por", [
  "lead",
  "agente_ia",
  "humano",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "enviado",
  "entregue",
  "lido",
  "erro",
]);

export const messagesTable = pgTable("messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  direcao: messageDirecaoEnum("direcao").notNull(),
  canal: messageCanalEnum("canal").notNull(),
  conteudo: text("conteudo").notNull(),
  tipoConteudo: messageTipoConteudoEnum("tipo_conteudo").notNull().default("texto"),
  enviadoPor: messageEnviadoPorEnum("enviado_por").notNull(),
  agentName: text("agent_name"),
  status: messageStatusEnum("status").notNull().default("enviado"),
  externalId: text("external_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});

export const updateMessageSchema = createSelectSchema(messagesTable)
  .pick({ status: true, externalId: true, agentName: true })
  .partial();

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type UpdateMessage = z.infer<typeof updateMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
