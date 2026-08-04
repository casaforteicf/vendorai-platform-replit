import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const relatosTecnicosTable = pgTable("relatos_tecnicos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  leadId: uuid("lead_id"),
  conversationId: uuid("conversation_id"),
  // Título curto — obrigatório em relatos novos (chat de Suporte interno);
  // relatos antigos (flagados a partir de conversa com lead) podem não ter.
  titulo: text("titulo"),
  // Quem estava conversando com o agente de Suporte interno — só
  // preenchido nesse caso; null quando o relato veio de conversa com lead.
  usuarioId: text("usuario_id"),
  descricaoProblema: text("descricao_problema").notNull(),
  transcriptRelevante: text("transcript_relevante"),
  status: text("status").notNull().default("pendente_revisao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
