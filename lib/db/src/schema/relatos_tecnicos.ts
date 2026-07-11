import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const relatosTecnicosTable = pgTable("relatos_tecnicos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  leadId: uuid("lead_id"),
  conversationId: uuid("conversation_id"),
  descricaoProblema: text("descricao_problema").notNull(),
  transcriptRelevante: text("transcript_relevante"),
  status: text("status").notNull().default("pendente_revisao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
