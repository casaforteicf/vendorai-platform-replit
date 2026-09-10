import { and, eq, inArray, lte } from "drizzle-orm";
import type { Logger } from "pino";
import { commerceCheckoutSessionsTable, db, generatedSitesTable } from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";

const ABANDONMENT_AFTER_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [6 * 60 * 60 * 1000, 18 * 60 * 60 * 1000, 0] as const;
let running = false;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Olá";
}

function recoveryMessage(row: {
  customerName: string;
  companyName: string;
  paymentUrl: string | null;
  offerSnapshot: { vertical: string | null; planSlug: string };
}): string {
  const vertical = row.offerSnapshot.vertical ? ` para ${row.offerSnapshot.vertical}` : "";
  return `${firstName(row.customerName)}, vi que você iniciou a ativação do VendorAI${vertical}, mas o pagamento ainda não foi concluído. Seu checkout continua disponível${row.paymentUrl ? ` aqui: ${row.paymentUrl}` : "."}\n\nSe ficou alguma dúvida sobre o plano ou a implantação na ${row.companyName}, responda esta mensagem e eu te ajudo.`;
}

export async function runCheckoutAbandonmentRecovery(log: Logger): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const abandonmentCutoff = new Date(now.getTime() - ABANDONMENT_AFTER_MS);

    const rows = await db
      .select({
        id: commerceCheckoutSessionsTable.id,
        customerName: commerceCheckoutSessionsTable.customerName,
        companyName: commerceCheckoutSessionsTable.companyName,
        phone: commerceCheckoutSessionsTable.phone,
        paymentUrl: commerceCheckoutSessionsTable.paymentUrl,
        offerSnapshot: commerceCheckoutSessionsTable.offerSnapshot,
        recoveryStatus: commerceCheckoutSessionsTable.recoveryStatus,
        recoveryAttempts: commerceCheckoutSessionsTable.recoveryAttempts,
        recoveryNextAt: commerceCheckoutSessionsTable.recoveryNextAt,
        siteTenantId: generatedSitesTable.tenantId,
      })
      .from(commerceCheckoutSessionsTable)
      .innerJoin(generatedSitesTable, eq(generatedSitesTable.id, commerceCheckoutSessionsTable.siteId))
      .where(and(
        inArray(commerceCheckoutSessionsTable.status, ["created", "payment_pending"]),
        lte(commerceCheckoutSessionsTable.createdAt, abandonmentCutoff),
      ))
      .limit(200);

    for (const row of rows) {
      if (row.recoveryAttempts >= MAX_ATTEMPTS || row.recoveryStatus === "exhausted" || row.recoveryStatus === "skipped") continue;
      if (row.recoveryNextAt && row.recoveryNextAt > now) continue;

      if (!row.phone || !row.paymentUrl) {
        await db.update(commerceCheckoutSessionsTable).set({
          recoveryStatus: "skipped",
          recoveryLastError: !row.phone ? "missing_phone" : "missing_payment_url",
          updatedAt: now,
        }).where(eq(commerceCheckoutSessionsTable.id, row.id));
        continue;
      }

      if (!(await tenantIsWithinBusinessHours(row.siteTenantId))) {
        await db.update(commerceCheckoutSessionsTable).set({
          recoveryStatus: "scheduled",
          recoveryNextAt: new Date(now.getTime() + 60 * 60 * 1000),
          updatedAt: now,
        }).where(eq(commerceCheckoutSessionsTable.id, row.id));
        continue;
      }

      try {
        await sendDirectWhatsAppMessage(
          row.siteTenantId,
          row.phone,
          recoveryMessage(row),
          log,
        );

        const attempts = row.recoveryAttempts + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 0;
        await db.update(commerceCheckoutSessionsTable).set({
          recoveryStatus: exhausted ? "exhausted" : "contacted",
          recoveryAttempts: attempts,
          recoveryLastAt: now,
          recoveryNextAt: exhausted ? null : new Date(now.getTime() + delay),
          recoveryChannel: "whatsapp",
          recoveryLastError: null,
          updatedAt: now,
        }).where(eq(commerceCheckoutSessionsTable.id, row.id));
      } catch (err) {
        log.warn({ err, checkoutId: row.id }, "checkout-recovery: WhatsApp send failed");
        await db.update(commerceCheckoutSessionsTable).set({
          recoveryStatus: "scheduled",
          recoveryNextAt: new Date(now.getTime() + 60 * 60 * 1000),
          recoveryLastError: err instanceof Error ? err.message.slice(0, 500) : "whatsapp_send_failed",
          updatedAt: now,
        }).where(eq(commerceCheckoutSessionsTable.id, row.id));
      }
    }
  } finally {
    running = false;
  }
}

export async function getCheckoutFunnelMetrics() {
  const rows = await db.select({
    siteSlug: commerceCheckoutSessionsTable.siteSlug,
    status: commerceCheckoutSessionsTable.status,
    offerSnapshot: commerceCheckoutSessionsTable.offerSnapshot,
    attribution: commerceCheckoutSessionsTable.attribution,
    recoveryAttempts: commerceCheckoutSessionsTable.recoveryAttempts,
  }).from(commerceCheckoutSessionsTable).limit(5000);

  const groups = new Map<string, {
    vertical: string;
    campaign: string;
    siteSlug: string;
    started: number;
    provisioned: number;
    pending: number;
    failed: number;
    contacted: number;
    recovered: number;
  }>();

  for (const row of rows) {
    const vertical = row.offerSnapshot.vertical || "sem_vertical";
    const campaign = row.attribution.utmCampaign || row.offerSnapshot.offerCode || "sem_campanha";
    const key = `${vertical}::${campaign}::${row.siteSlug}`;
    const group = groups.get(key) ?? { vertical, campaign, siteSlug: row.siteSlug, started: 0, provisioned: 0, pending: 0, failed: 0, contacted: 0, recovered: 0 };
    group.started += 1;
    if (row.status === "provisioned") group.provisioned += 1;
    else if (row.status === "failed" || row.status === "cancelled") group.failed += 1;
    else group.pending += 1;
    if (row.recoveryAttempts > 0) group.contacted += 1;
    if (row.status === "provisioned" && row.recoveryAttempts > 0) group.recovered += 1;
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    conversionPercent: group.started ? Number(((group.provisioned / group.started) * 100).toFixed(2)) : 0,
    recoveryPercent: group.contacted ? Number(((group.recovered / group.contacted) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.started - a.started);
}
