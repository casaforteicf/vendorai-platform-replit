import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/**
 * Registro de notificações enviadas — evita duplicatas em crons de lembrete.
 */
export const notificationLogsTable = pgTable("notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  /** ID de referência (ex: agendamento.id) */
  referenceId: text("reference_id").notNull(),
  /** Tipo de referência: agendamento, etc. */
  referenceType: text("reference_type").notNull().default("agendamento"),
  /** destinatário: número/email/userId */
  recipient: text("recipient").notNull(),
  /** whatsapp | email | in_app */
  channel: text("channel").notNull(),
  /** nome do tipo de notificação: daily_summary, daily_lead_reminder, etc. */
  notificationType: text("notification_type").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
