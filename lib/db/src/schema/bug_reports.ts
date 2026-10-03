import { pgTable, text, timestamp, pgEnum, uuid, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const bugReportCategoriaEnum = pgEnum("bug_report_categoria", [
  "bug",
  "duvida",
  "sugestao",
]);

export const bugReportStatusEnum = pgEnum("bug_report_status", [
  "aberto",
  "em_analise",
  "resolvido",
]);

export const bugReportPrioridadeEnum = pgEnum("bug_report_prioridade", [
  "baixa",
  "media",
  "alta",
  "critica",
]);

export const bugReportsTable = pgTable("bug_reports", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id"),
  resolvidoPor: text("resolvido_por"),
  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull(),
  categoria: bugReportCategoriaEnum("categoria").notNull().default("bug"),
  status: bugReportStatusEnum("status").notNull().default("aberto"),
  prioridade: bugReportPrioridadeEnum("prioridade").notNull().default("media"),
  rotaAfetada: text("rota_afetada"),
  changeScope: text("change_scope"),
  scopeReason: text("scope_reason"),
  tenantContextSnapshot: jsonb("tenant_context_snapshot").$type<Record<string, unknown> | null>(),
  erroTecnico: text("erro_tecnico"),
  stackTrace: text("stack_trace"),
  respostaSuporte: text("resposta_suporte"),
  resolvidoAt: timestamp("resolvido_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
}, (table) => ({
  tenantConversationUnique: uniqueIndex("bug_reports_tenant_conversation_idx")
    .on(table.tenantId, table.conversationId),
}));

export const insertBugReportSchema = createInsertSchema(bugReportsTable, {
  titulo: z.string().min(1).max(255),
  descricao: z.string().min(1),
});

export const selectBugReportSchema = createSelectSchema(bugReportsTable);
