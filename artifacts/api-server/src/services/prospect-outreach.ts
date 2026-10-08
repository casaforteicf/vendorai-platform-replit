import { and, eq, gte, isNull } from "drizzle-orm";
import {
  businessProfilesTable,
  contentLibraryTable,
  db,
  tenantsTable,
  prospectInteractionsTable,
  prospectsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendDirectWhatsAppMessage, sendOperationalEmail } from "./omnichannel.js";
import { resolveColdProspectingConfig } from "./cold-prospecting-config.js";
import { decideProspectNextAction } from "./prospect-decision-engine.js";

function localMinutes(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function hhmmMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function inContactWindow(start: string, end: string, timezone: string): boolean {
  const now = localMinutes(timezone);
  const from = hhmmMinutes(start);
  const to = hhmmMinutes(end);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

function materialText(variation: unknown): string {
  if (!variation || typeof variation !== "object") return "";
  const v = variation as Record<string, unknown>;
  return [
    typeof v["hook"] === "string" ? v["hook"] : "",
    typeof v["caption"] === "string" ? v["caption"] : "",
    typeof v["text"] === "string" ? v["text"] : "",
    typeof v["cta"] === "string" ? v["cta"] : "",
  ].filter(Boolean).join("\n\n").trim();
}

export async function sendProspectOutreach(input: {
  tenantId: string;
  prospectId: string;
  channel: "whatsapp" | "email";
  content?: string | null;
  subject?: string | null;
  materialId?: string | null;
  autonomous?: boolean;
  objective?: string | null;
  reason?: string | null;
  log: Logger;
}) {
  const runtime = await resolveColdProspectingConfig(input.tenantId);
  if (runtime.mode === "off") throw new Error("cold_prospecting_disabled");
  if (input.autonomous && runtime.mode !== "autonomous") throw new Error("autonomous_mode_disabled");
  if (!runtime.allowedChannels.includes(input.channel)) throw new Error("channel_not_allowed");
  if (!inContactWindow(runtime.contactWindowStart, runtime.contactWindowEnd, runtime.timezone)) {
    throw new Error("outside_contact_window");
  }

  const [prospect] = await db.select().from(prospectsTable).where(and(
    eq(prospectsTable.id, input.prospectId),
    eq(prospectsTable.tenantId, input.tenantId),
    isNull(prospectsTable.convertedAt),
  )).limit(1);
  if (!prospect) throw new Error("prospect_not_found");
  if (prospect.stage === "nao_contatar" || prospect.stage === "sem_aderencia") throw new Error("prospect_contact_blocked");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await db.select({ id: prospectInteractionsTable.id }).from(prospectInteractionsTable).where(and(
    eq(prospectInteractionsTable.tenantId, input.tenantId),
    eq(prospectInteractionsTable.prospectId, prospect.id),
    eq(prospectInteractionsTable.direction, "outbound"),
    gte(prospectInteractionsTable.occurredAt, since),
  ));
  if (recent.length >= runtime.maxContactsPerPerson7d) throw new Error("contact_limit_reached");

  let material: typeof contentLibraryTable.$inferSelect | null = null;
  if (input.materialId) {
    [material] = await db.select().from(contentLibraryTable).where(and(
      eq(contentLibraryTable.id, input.materialId),
      eq(contentLibraryTable.tenantId, input.tenantId),
      eq(contentLibraryTable.commercialUse, true),
      eq(contentLibraryTable.approvalStatus, "approved"),
    )).limit(1);
    if (!material) throw new Error("material_not_approved");
    if (input.autonomous && !material.autoSendAllowed) throw new Error("material_auto_send_not_allowed");
  }

  const content = (input.content?.trim() || materialText(material?.variation)).trim();
  if (!content) throw new Error("empty_outreach_content");

  const [brand] = await db.select({
    businessName: businessProfilesTable.nomeFantasia,
  }).from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, input.tenantId)).limit(1);
  const [tenant] = await db.select({
    name: tenantsTable.name,
    nomeEmpresa: tenantsTable.nomeEmpresa,
  }).from(tenantsTable).where(eq(tenantsTable.id, input.tenantId)).limit(1);
  const tenantName = brand?.businessName || tenant?.nomeEmpresa || tenant?.name || "Empresa";

  let externalId: string | undefined;
  if (input.channel === "whatsapp") {
    if (!prospect.phone) throw new Error("prospect_phone_missing");
    externalId = await sendDirectWhatsAppMessage(input.tenantId, prospect.phone, content, input.log);
  } else {
    if (!prospect.email) throw new Error("prospect_email_missing");
    externalId = await sendOperationalEmail({
      tenantId: input.tenantId,
      tenantName,
      to: prospect.email,
      subject: input.subject?.trim() || material?.title || "Contato",
      text: content,
    }, input.log);
  }

  const now = new Date();
  const [interaction] = await db.insert(prospectInteractionsTable).values({
    tenantId: input.tenantId,
    prospectId: prospect.id,
    direction: "outbound",
    channel: input.channel,
    status: "sent",
    content,
    subject: input.subject ?? null,
    externalId: externalId ?? null,
    materialId: material?.id ?? null,
    objective: input.objective ?? prospect.currentObjective,
    reason: input.reason ?? prospect.nextBestActionReason,
    sentAt: now,
    occurredAt: now,
    metadata: { autonomous: input.autonomous === true },
  }).returning();

  const decision = decideProspectNextAction({
    ...prospect,
    stage: prospect.stage === "encontrado" || prospect.stage === "analisado" ? "em_contato" : prospect.stage,
  });
  await db.update(prospectsTable).set({
    stage: decision.stage,
    currentState: decision.currentState,
    currentObjective: decision.currentObjective,
    nextBestAction: decision.nextBestAction,
    nextBestActionReason: decision.nextBestActionReason,
    lastInteractionAt: now,
    nextActionAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
    updatedAt: now,
  }).where(eq(prospectsTable.id, prospect.id));

  return { interaction, externalId: externalId ?? null };
}
