import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/**
 * Memória compacta de continuidade do JARVIS.
 *
 * Uma linha por tenant + usuário. Não é um transcript completo nem um perfil
 * pessoal: guarda somente o contexto operacional mínimo necessário para retomar
 * um assunto entre sessões sem depender do estado do navegador.
 */
export const jarvisContinuityTable = pgTable("jarvis_continuity", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  subject: text("subject").notNull(),
  lastUserMessage: text("last_user_message").notNull(),
  lastAssistantResponse: text("last_assistant_response"),
  route: text("route"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantUserUnique: uniqueIndex("jarvis_continuity_tenant_user_uidx").on(table.tenantId, table.userId),
  tenantUpdatedIdx: index("jarvis_continuity_tenant_updated_idx").on(table.tenantId, table.updatedAt),
}));
