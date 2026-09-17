import { and, eq, or } from "drizzle-orm";
import { Resend } from "resend";
import {
  accessLicenseReminderLogsTable,
  accessLicensesTable,
  db,
  notificationsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { brazilMonthKey, hasActiveAccess } from "./accessLicense.js";

type Reminder = {
  type: string;
  cycleKey: string;
  title: string;
  message: string;
  emailSubject: string;
};

const APP_URL = (process.env.APP_URL ?? "https://app.appvendorai.com").replace(/\/$/, "");

function saoPauloDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", day: "2-digit",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "day")?.value ?? "1");
}

function buildReminder(license: typeof accessLicensesTable.$inferSelect, now: Date): Reminder | null {
  const month = brazilMonthKey(now);
  const active = hasActiveAccess(license, now);
  if (active && license.accessEndsAt) {
    const hours = (license.accessEndsAt.getTime() - now.getTime()) / 3_600_000;
    const date = license.accessEndsAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    if (hours <= 24) return {
      type: "access_ending_24h", cycleKey: license.accessEndsAt.toISOString(),
      title: "Seu acesso termina em menos de 24 horas",
      message: `Seu VendorAI Growth completo termina em ${date}. Abra o VendorAI para continuar por mais um período ou seguir com a condição comercial vinculada à sua oferta: ${APP_URL}/dashboard`,
      emailSubject: "Seu acesso VendorAI termina em menos de 24 horas",
    };
    if (hours <= 48) return {
      type: "access_ending_48h", cycleKey: license.accessEndsAt.toISOString(),
      title: "Faltam 2 dias para o fim do acesso",
      message: `Seu acesso completo termina em ${date}. Antecipe a continuidade sem perder o prazo atual. A condição comercial válida é a registrada na sua oferta: ${APP_URL}/dashboard`,
      emailSubject: "Faltam 2 dias para o fim do seu acesso VendorAI",
    };
    return null;
  }

  if (license.freeBenefitMonth !== month) {
    const day = saoPauloDay(now);
    const stage = day >= 25 ? "d25" : day >= 15 ? "d15" : day >= 7 ? "d7" : day >= 3 ? "d3" : "d1";
    return {
      type: `monthly_activation_${stage}`, cycleKey: month,
      title: "Seus 5 dias gratuitos estão disponíveis",
      message: `Ative agora seus 5 dias completos do VendorAI Growth deste mês. Todos os módulos, agentes e automações ficam liberados por 120 horas: ${APP_URL}/dashboard`,
      emailSubject: "Ative seus 5 dias gratuitos do VendorAI",
    };
  }

  return {
    type: "access_expired", cycleKey: month,
    title: "VendorAI em modo somente consulta",
    message: `Seu período terminou. Seus dados estão preservados. Abra o VendorAI para continuar conforme a condição comercial vinculada à sua oferta: ${APP_URL}/dashboard`,
    emailSubject: "Continue usando o VendorAI completo",
  };
}

async function alreadySent(tenantId: string, reminder: Reminder, channel: "in_app" | "email" | "whatsapp", recipient: string) {
  const [row] = await db.select({ id: accessLicenseReminderLogsTable.id })
    .from(accessLicenseReminderLogsTable).where(and(
      eq(accessLicenseReminderLogsTable.tenantId, tenantId),
      eq(accessLicenseReminderLogsTable.cycleKey, reminder.cycleKey),
      eq(accessLicenseReminderLogsTable.reminderType, reminder.type),
      eq(accessLicenseReminderLogsTable.channel, channel),
      eq(accessLicenseReminderLogsTable.recipient, recipient),
      eq(accessLicenseReminderLogsTable.status, "sent"),
    ));
  return !!row;
}

async function record(tenantId: string, reminder: Reminder, channel: "in_app" | "email" | "whatsapp", recipient: string, status: "sent" | "failed", error?: unknown) {
  await db.insert(accessLicenseReminderLogsTable).values({
    tenantId, cycleKey: reminder.cycleKey, reminderType: reminder.type, channel, recipient, status,
    error: error ? String(error instanceof Error ? error.message : error).slice(0, 1000) : null,
  }).onConflictDoUpdate({
    target: [
      accessLicenseReminderLogsTable.tenantId,
      accessLicenseReminderLogsTable.cycleKey,
      accessLicenseReminderLogsTable.reminderType,
      accessLicenseReminderLogsTable.channel,
      accessLicenseReminderLogsTable.recipient,
    ],
    set: { status, error: error ? String(error).slice(0, 1000) : null, sentAt: new Date() },
  });
}

async function sendEmail(to: string, name: string, reminder: Reminder) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY_NOT_CONFIGURED");
  const resend = new Resend(key);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "vendorai@vendorai.app";
  const result = await resend.emails.send({
    from: `VendorAI <${fromEmail}>`, to, subject: reminder.emailSubject,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">
      <h2>${reminder.title}</h2><p>Olá, ${name}.</p><p style="line-height:1.6">${reminder.message}</p>
      <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Abrir VendorAI</a>
    </div>`,
  });
  if (result.error) throw new Error(result.error.message);
}

export async function runAccessLicenseReminders() {
  const now = new Date();
  const licenses = await db.select().from(accessLicensesTable)
    .where(eq(accessLicensesTable.mode, "prepaid"));
  let sent = 0;
  let failed = 0;

  for (const license of licenses) {
    const reminder = buildReminder(license, now);
    if (!reminder) continue;

    const [tenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable)
      .where(eq(tenantsTable.id, license.tenantId));
    const [admin] = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.telefone,
    }).from(usersTable).where(and(
      eq(usersTable.tenantId, license.tenantId),
      eq(usersTable.active, true),
      or(eq(usersTable.platformRole, "tenant_admin"), eq(usersTable.userFunction, "administrador")),
    )).limit(1);
    if (!admin) continue;

    if (!(await alreadySent(license.tenantId, reminder, "in_app", admin.id))) {
      try {
        await db.insert(notificationsTable).values({
          tenantId: license.tenantId, title: reminder.title, message: reminder.message,
          type: "warning", category: "access_license",
        });
        await record(license.tenantId, reminder, "in_app", admin.id, "sent");
        sent++;
      } catch (error) {
        await record(license.tenantId, reminder, "in_app", admin.id, "failed", error);
        failed++;
      }
    }

    if (!(await alreadySent(license.tenantId, reminder, "email", admin.email))) {
      try {
        await sendEmail(admin.email, admin.name, reminder);
        await record(license.tenantId, reminder, "email", admin.email, "sent");
        sent++;
      } catch (error) {
        await record(license.tenantId, reminder, "email", admin.email, "failed", error);
        failed++;
      }
    }

    if (admin.phone && !(await alreadySent(license.tenantId, reminder, "whatsapp", admin.phone))) {
      try {
        await sendDirectWhatsAppMessage(license.tenantId, admin.phone, reminder.message, logger);
        await record(license.tenantId, reminder, "whatsapp", admin.phone, "sent");
        sent++;
      } catch (error) {
        await record(license.tenantId, reminder, "whatsapp", admin.phone, "failed", error);
        failed++;
      }
    }
  }

  return { tenants: licenses.length, sent, failed, processedAt: now.toISOString() };
}
