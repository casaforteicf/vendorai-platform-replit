import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  leadsTable,
  conversationsTable,
  messagesTable,
  tenantsTable,
  billingEventsTable,
  tokenPurchasesTable,
  vendorTokenTransactionsTable,
  dealsTable,
  prospectorFlowExecutionsTable,
  campaignSentLogsTable,
  erpTitulosTable,
  erpPagamentosTable,
  erpIntegracaoEventosTable,
  instagramConnectionsTable,
  whatsappConnectionsTable,
  adCampaignsTable,
  usersTable,
  bugReportsTable,
} from "@workspace/db";
import { dispatchSkuDelivery } from "../lib/product-delivery.js";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { z } from "zod";
import { verifyToken } from "../lib/jwt.js";
import {
  sendOutgoingMessage,
  LeadNotFoundError,
  InstagramNotConnectedError,
  InstagramScopedIdMissingError,
} from "../services/omnichannel.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";
import { recordIntelligenceEvent, recordIntelligenceFact } from "../services/customer-intelligence-history.js";
import { resolveStageQuestionsFromInboundMessage } from "../services/stage-question-resolution.js";
import { runAutoQuotePipeline } from "../services/auto-quote.js";
import { transcribeAudio, transcribeAudioBuffer } from "../services/audio-transcription.js";
import { interpretImage, interpretPdf, interpretPdfBuffer } from "../services/media-interpretation.js";
import { getBase64FromMediaMessage } from "../services/evolution-whatsapp.js";

import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { handleAppointmentConfirmation } from "../jobs/appointmentReminders.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { tryIngestTechnicianSupportMessage } from "../services/support-whatsapp-ingest.js";
import { tryHandleSupportFeedbackMessage } from "../services/support-feedback.js";
import { startVoiceSession, registerVoiceTurn, endVoiceSession } from "../services/voice-agent-orchestrator.js";
import { createVendorAiVoiceStream, resolveDefaultVendorAiVoice } from "../services/vendorai-voice-engine.js";

const objectStorage = new ObjectStorageService();

async function resolveVendorAiSupportSender(receivingTenantId: string, phone?: string | null, email?: string | null) {
  const [receivingTenant] = await db.select({ slug: tenantsTable.slug }).from(tenantsTable).where(eq(tenantsTable.id, receivingTenantId)).limit(1);
  const supportSlug = process.env["VENDORAI_SUPPORT_TENANT_SLUG"]?.trim() || "vendorai";
  if (receivingTenant?.slug !== supportSlug) return [];

  const normalizedPhone = String(phone ?? "").replace(/\D/g, "");
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const rows = await db.select({
    userId: usersTable.id,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userPhone: usersTable.telefone,
    tenantId: usersTable.tenantId,
    tenantName: tenantsTable.name,
    tenantSlug: tenantsTable.slug,
    vertical: tenantsTable.vertical,
    verticalSecundaria: tenantsTable.verticalSecundaria,
    planId: tenantsTable.planId,
    platformRole: usersTable.platformRole,
  }).from(usersTable).innerJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id)).where(eq(usersTable.active, true));

  const matched = rows.filter((row) => {
    if (row.tenantId === receivingTenantId) return false;
    const rowPhone = String(row.userPhone ?? "").replace(/\D/g, "");
    const byPhone = Boolean(normalizedPhone && rowPhone && (rowPhone === normalizedPhone || (Math.min(rowPhone.length, normalizedPhone.length) >= 10 && (rowPhone.endsWith(normalizedPhone) || normalizedPhone.endsWith(rowPhone)))));
    const byEmail = Boolean(normalizedEmail && row.userEmail.trim().toLowerCase() === normalizedEmail);
    return byPhone || byEmail;
  });
  const unique = new Map<string, typeof matched[number]>();
  for (const row of matched) if (!unique.has(row.tenantId)) unique.set(row.tenantId, row);
  return [...unique.values()];
}

async function classifyVendorAiPlatformSupport(tenantId: string, text: string) {
  const fallback = { categoria: "sugestao" as const, prioridade: "media" as const, titulo: text.slice(0, 255), descricao: text, escopo: "tenant" as const, motivo: "Escopo conservador até análise técnica.", precisaAcompanhamento: true };
  try {
    const openai = await getOpenAIForTenant(tenantId);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Classifique suporte do VendorAI em JSON: categoria duvida|bug|sugestao; prioridade baixa|media|alta|critica; titulo; descricao; escopo tenant|vertical|global_opcional|global|bug; motivo; precisaAcompanhamento boolean. Dúvida simples não vira demanda. Bug e melhoria viram. Em dúvida use o menor escopo reutilizável." },
        { role: "user", content: text }
      ]
    });
    const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const categoria = ["duvida","bug","sugestao"].includes(String(raw["categoria"])) ? String(raw["categoria"]) : fallback.categoria;
    const prioridade = ["baixa","media","alta","critica"].includes(String(raw["prioridade"])) ? String(raw["prioridade"]) : fallback.prioridade;
    const escopo = ["tenant","vertical","global_opcional","global","bug"].includes(String(raw["escopo"])) ? String(raw["escopo"]) : fallback.escopo;
    return {
      categoria: categoria as "duvida"|"bug"|"sugestao",
      prioridade: prioridade as "baixa"|"media"|"alta"|"critica",
      titulo: String(raw["titulo"] ?? fallback.titulo).slice(0,255),
      descricao: String(raw["descricao"] ?? text).slice(0,12000),
      escopo: escopo as "tenant"|"vertical"|"global_opcional"|"global"|"bug",
      motivo: String(raw["motivo"] ?? fallback.motivo).slice(0,4000),
      precisaAcompanhamento: raw["precisaAcompanhamento"] !== false && categoria !== "duvida",
    };
  } catch {
    return fallback;
  }
}

async function tryVendorAiPlatformSupportInbound(input: {
  receivingTenantId: string;
  channel: "whatsapp" | "instagram";
  text: string;
  senderPhone?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  sourceMessageId?: string | null;
  provider: string;
}) {
  const matches = await resolveVendorAiSupportSender(input.receivingTenantId, input.senderPhone, input.senderEmail);
  if (!matches.length) return { handled: false as const };
  if (matches.length > 1) return { handled: true as const, status: "tenant_ambiguous" as const, tenantOptions: matches.map((x) => ({ tenantId: x.tenantId, tenantName: x.tenantName })) };

  const requester = matches[0];
  const classification = await classifyVendorAiPlatformSupport(requester.tenantId, input.text);
  if (!classification.precisaAcompanhamento) return { handled: true as const, status: "duvida" as const, tenantId: requester.tenantId, tenantName: requester.tenantName };

  const [saved] = await db.insert(bugReportsTable).values({
    tenantId: requester.tenantId,
    titulo: classification.titulo,
    descricao: classification.descricao,
    categoria: classification.categoria,
    prioridade: classification.prioridade,
    status: "aberto",
    changeScope: classification.escopo,
    scopeReason: classification.motivo,
    tenantContextSnapshot: {
      tenantId: requester.tenantId, tenantName: requester.tenantName, tenantSlug: requester.tenantSlug,
      vertical: requester.vertical ?? null, verticalSecundaria: requester.verticalSecundaria ?? null,
      planId: requester.planId ?? null, userId: requester.userId, userName: requester.userName,
      platformRole: requester.platformRole, sourceChannel: input.channel, provider: input.provider,
      receivingTenantId: input.receivingTenantId, capturedAt: new Date().toISOString()
    },
    sourceChannel: input.channel,
    sourceSender: input.senderEmail ?? input.senderPhone ?? input.senderName ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
  } as any).returning();

  return { handled: true as const, status: "technical_demand_created" as const, tenantId: requester.tenantId, tenantName: requester.tenantName, bugReportId: saved?.id ?? null };
}

function routeTenantId(req: any): string {
  // tenant-audit: reviewed route tenant; webhook handlers validate the tenant-scoped secret or dualAuth before processing tenant data.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}



const router: IRouter = Router();


const voiceBridgeSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.string().min(1),
  sessionId: z.string().min(1),
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/wav"),
  language: z.string().default("pt-br"),
});

router.post("/webhooks/voice/call-turn", async (req, res) => {
  const expected = process.env["VENDORAI_VOICE_BRIDGE_SECRET"];
  const provided = req.headers["x-vendorai-voice-bridge-secret"];
  if (!expected || typeof provided !== "string" || provided !== expected) {
    res.status(401).json({ error: "Invalid voice bridge secret" });
    return;
  }

  const parsed = voiceBridgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const audio = Buffer.from(parsed.data.audioBase64, "base64");
  if (!audio.length || audio.length > 8 * 1024 * 1024) {
    res.status(422).json({ error: "VOICE_AUDIO_INVALID" });
    return;
  }

  try {
    const transcript = (await transcribeAudioBuffer(audio, parsed.data.tenantId, req.log, parsed.data.mimeType)).trim();
    if (!transcript) {
      res.status(204).end();
      return;
    }

    const turn = await registerVoiceTurn({
      tenantId: parsed.data.tenantId,
      leadId: parsed.data.leadId,
      sessionId: parsed.data.sessionId,
      transcript,
      log: req.log,
    });

    const text = turn.reply?.text?.trim();
    if (!text) {
      res.status(200).json({ transcript, turn, audio: false });
      return;
    }

    const defaultVoice = await resolveDefaultVendorAiVoice({
      tenantId: parsed.data.tenantId,
      language: parsed.data.language,
    });
    if (!defaultVoice) {
      res.status(200).json({
        transcript,
        turn,
        audio: false,
        warning: "DUBLE_VOICE_NOT_CONFIGURED",
      });
      return;
    }

    const stream = await createVendorAiVoiceStream({
      tenantId: parsed.data.tenantId,
      identityId: defaultVoice.identityId,
      voiceProfileId: defaultVoice.voiceProfileId,
      text,
      language: parsed.data.language,
    });

    res.status(200);
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-vendorai-transcript", encodeURIComponent(transcript.slice(0, 500)));
    res.setHeader("x-vendorai-agent", turn.state.specialist);
    res.setHeader("x-vendorai-voice-job-id", stream.jobId);

    const reader = stream.response.body!.getReader();
    req.on("close", () => {
      void reader.cancel("call_bridge_disconnected");
    });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    req.log.error({ error }, "voice bridge: call turn failed");
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : "VOICE_BRIDGE_FAILED" });
    } else {
      res.end();
    }
  }
});


async function ensureVoiceLeadForPhone(input: {
  tenantId: string;
  phone: string;
  name?: string;
}) {
  const match = await findLeadByDedup(input.tenantId, input.phone, null, null);
  if (match.found) return match.lead;

  const normalized = storePhone(input.phone);
  const [lead] = await db
    .insert(leadsTable)
    .values({
      tenantId: input.tenantId,
      nome: input.name?.trim() || input.phone,
      telefone: normalized,
      status: "novo",
      source: "whatsapp",
    })
    .returning();

  await db.insert(dealsTable).values({
    tenantId: input.tenantId,
    leadId: lead.id,
    titulo: lead.nome,
    etapa: "em_aquecimento",
  });

  return lead;
}

async function callWorkerJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = process.env["VENDORAI_CALL_WORKER_URL"]?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("VENDORAI_CALL_WORKER_URL não configurada");

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env["VENDORAI_CALL_WORKER_SECRET"];
  if (secret) headers["x-vendorai-call-worker-secret"] = secret;

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Voice call worker ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload as T;
}

async function metaCallAction(input: {
  phoneNumberId: string;
  accessToken: string;
  action: "pre_accept" | "accept" | "reject" | "terminate";
  callId: string;
  sdp?: string;
  opaqueData?: string;
}) {
  const version = process.env["META_GRAPH_API_VERSION"]?.trim() || "v26.0";
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    call_id: input.callId,
    action: input.action,
  };
  if (input.sdp && (input.action === "pre_accept" || input.action === "accept")) {
    payload["session"] = { sdp_type: "answer", sdp: input.sdp };
  }
  if (input.opaqueData) payload["biz_opaque_callback_data"] = input.opaqueData.slice(0, 512);

  const response = await fetch(
    `https://graph.facebook.com/${version}/${input.phoneNumberId}/calls`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body && typeof body === "object" && "error" in body)) {
    throw new Error(`Meta Calling API ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}


function parseVoiceOpaqueData(value: unknown): Record<string, string> {
  if (typeof value !== "string" || !value) return {};
  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0]) && Boolean(pair[1])),
  );
}

async function handleMetaCallWebhook(input: {
  value: Record<string, unknown>;
  phoneNumberId: string;
  whatsappConnection: {
    tenantId: string;
    metaAccessToken: string | null;
  };
  log: Request["log"];
}) {
  const calls = (input.value["calls"] ?? []) as Array<Record<string, unknown>>;
  if (!calls.length) return;

  const contacts = (input.value["contacts"] ?? []) as Array<Record<string, unknown>>;
  const senderName = (contacts[0] as any)?.profile?.name as string | undefined;
  const tenantId = input.whatsappConnection.tenantId;
  const accessToken = input.whatsappConnection.metaAccessToken;
  if (!accessToken) throw new Error("Meta access token ausente para WhatsApp Calling");

  for (const call of calls) {
    const callId = String(call["id"] ?? "");
    const event = String(call["event"] ?? "");
    const direction = String(call["direction"] ?? "");
    const from = String(call["from"] ?? "");
    if (!callId || !event) continue;

    if (event === "connect" && direction === "BUSINESS_INITIATED") {
      const session = (call["session"] ?? {}) as Record<string, unknown>;
      const remoteSdp = String(session["sdp"] ?? "");
      const opaque = parseVoiceOpaqueData(call["biz_opaque_callback_data"]);
      const callKey = opaque["callKey"] ?? "";
      if (!remoteSdp || !callKey) {
        input.log.warn({ callId, direction, hasSdp: Boolean(remoteSdp), callKey }, "meta-calling: outbound connect missing SDP/correlation");
        continue;
      }

      await callWorkerJson<{ ok: boolean }>(
        `/v1/calls/${encodeURIComponent(callKey)}/remote-answer`,
        { sdp: remoteSdp },
      );

      input.log.info(
        {
          tenantId,
          callId,
          callKey,
          leadId: opaque["lead"] ?? null,
          sessionId: opaque["session"] ?? null,
        },
        "meta-calling: outbound WhatsApp call WebRTC answer applied",
      );
      continue;
    }

    if (event === "connect" && direction === "USER_INITIATED") {
      const session = (call["session"] ?? {}) as Record<string, unknown>;
      const remoteSdp = String(session["sdp"] ?? "");
      if (!remoteSdp || !from) {
        input.log.warn({ callId, event, direction }, "meta-calling: inbound connect missing SDP/from");
        continue;
      }

      const lead = await ensureVoiceLeadForPhone({
        tenantId,
        phone: from,
        name: senderName,
      });

      const voiceSession = await startVoiceSession({
        tenantId,
        leadId: lead.id,
        source: "whatsapp",
        log: input.log,
      });

      const answer = await callWorkerJson<{ sdp: string; sdpType: string }>(
        "/v1/calls/inbound-answer",
        {
          call_key: callId,
          tenant_id: tenantId,
          lead_id: lead.id,
          session_id: voiceSession.sessionId,
          remote_sdp: remoteSdp,
        },
      );

      await metaCallAction({
        phoneNumberId: input.phoneNumberId,
        accessToken,
        action: "pre_accept",
        callId,
        sdp: answer.sdp,
        opaqueData: `tenant=${tenantId};lead=${lead.id};session=${voiceSession.sessionId}`,
      });

      await metaCallAction({
        phoneNumberId: input.phoneNumberId,
        accessToken,
        action: "accept",
        callId,
        sdp: answer.sdp,
        opaqueData: `tenant=${tenantId};lead=${lead.id};session=${voiceSession.sessionId}`,
      });

      input.log.info(
        { tenantId, leadId: lead.id, callId, sessionId: voiceSession.sessionId },
        "meta-calling: inbound WhatsApp call accepted by voice agent",
      );
      continue;
    }

    if (event === "terminate") {
      const opaque = parseVoiceOpaqueData(call["biz_opaque_callback_data"]);
      const workerCallKey = opaque["callKey"] || callId;
      const to = String(call["to"] ?? "");
      const leadPhone = direction === "BUSINESS_INITIATED" ? to : from;

      await callWorkerJson<{ ok: boolean }>(
        `/v1/calls/${encodeURIComponent(workerCallKey)}/terminate`,
        {},
      ).catch((error) => {
        input.log.warn({ error, callId, workerCallKey }, "meta-calling: worker terminate failed");
      });

      if (leadPhone) {
        const match = await findLeadByDedup(tenantId, leadPhone, null, null);
        if (match.found) {
          const [conversation] = await db
            .select({ metadata: conversationsTable.metadata })
            .from(conversationsTable)
            .where(and(
              eq(conversationsTable.tenantId, tenantId),
              eq(conversationsTable.leadId, match.lead.id),
            ))
            .orderBy(sql`${conversationsTable.updatedAt} DESC`)
            .limit(1);
          const voiceMeta = conversation?.metadata && typeof conversation.metadata === "object"
            ? (conversation.metadata as Record<string, unknown>)["voiceSession"]
            : null;
          const currentSessionId = voiceMeta && typeof voiceMeta === "object"
            ? String((voiceMeta as Record<string, unknown>)["sessionId"] ?? "")
            : "";
          if (currentSessionId) {
            await endVoiceSession({
              tenantId,
              leadId: match.lead.id,
              sessionId: currentSessionId,
            }).catch((error) => input.log.warn({ error, callId }, "meta-calling: session end failed"));
          }
        }
      }

      input.log.info({ tenantId, callId, workerCallKey, direction }, "meta-calling: call terminated");
    }
  }
}

async function attributeWhatsAppLeadFromCampaignCode(
  tenantId: string,
  leadId: string,
  messageText: string,
): Promise<string | null> {
  const code = messageText.match(/\b(vai_[a-z0-9]{6,20})\b/i)?.[1]?.toLowerCase();
  if (!code) return null;
  const [campaign] = await db.select({ id: adCampaignsTable.id })
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.tenantId, tenantId), eq(adCampaignsTable.utmCode, code)))
    .limit(1);
  if (!campaign) return null;

  const updated = await db.update(leadsTable)
    .set({ adCampaignId: campaign.id, updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId), isNull(leadsTable.adCampaignId)))
    .returning({ id: leadsTable.id });
  if (updated.length === 0) return null;

  await recordAdCampaignEvent({
    tenantId,
    campaignId: campaign.id,
    eventType: "lead_attributed",
    severity: "success",
    message: "Novo lead atribuído à campanha pelo código recebido no WhatsApp.",
    dedupeKey: `lead:${leadId}`,
    metadata: { leadId, channel: "whatsapp", attribution: "campaign_code" },
  });
  return campaign.id;
}

// ── Meta Cloud API media download ─────────────────────────────────────────────
async function downloadMetaMedia(mediaId: string, accessToken: string): Promise<Buffer> {
  const infoRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) throw new Error(`Meta media info failed: ${infoRes.status}`);
  const info = await infoRes.json() as { url?: string };
  if (!info.url) throw new Error(`Meta media ${mediaId}: no download URL in response`);

  const dataRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dataRes.ok) throw new Error(`Meta media download failed: ${dataRes.status}`);
  return Buffer.from(await dataRes.arrayBuffer());
}

// ── Dual-auth helper ─────────────────────────────────────────────────────────
// Accepts either X-Webhook-Secret (n8n / agents) or Authorization: Bearer JWT
// (frontend). Returns true and sets req.user on JWT path.
export async function dualAuth(
  req: Request,
  res: Response,
  tenantId: string
): Promise<boolean> {
  const secret = req.headers["x-webhook-secret"];
  const authHeader = req.headers["authorization"];

  // ── Path A: webhook secret ────────────────────────────────────────────────
  if (secret) {
    if (typeof secret !== "string") {
      res.status(401).json({ error: "Invalid X-Webhook-Secret header" });
      return false;
    }

    const [agentConfig] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));

    if (!agentConfig) {
      res.status(404).json({ error: "Tenant agent config not found" });
      return false;
    }

    if (!agentConfig.webhookSecret || agentConfig.webhookSecret !== secret) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return false;
    }

    return true;
  }

  // ── Path B: Bearer JWT ────────────────────────────────────────────────────
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);
      if (
        payload.platformRole !== "super_admin" &&
        payload.tenantId !== tenantId
      ) {
        res.status(403).json({ error: "Access denied to this tenant" });
        return false;
      }
      req.user = payload;
      return true;
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return false;
    }
  }

  res.status(401).json({
    error: "Provide either X-Webhook-Secret or Authorization: Bearer <token>",
  });
  return false;
}

// ── POST /tenants/:tenantId/webhooks/whatsapp ────────────────────────────────
const whatsappWebhookBody = z.object({
  telefone: z.string().min(1),
  nome: z.string().optional(),
  mensagem: z.string().min(1),
});

router.post("/tenants/:tenantId/webhooks/whatsapp", async (req, res) => {
  const tenantId = routeTenantId(req);
  const secret = req.headers["x-webhook-secret"];

  // ── 1. Validate webhook secret ─────────────────────────────────────────
  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing X-Webhook-Secret header" });
    return;
  }

  const [agentConfig] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig) {
    res.status(404).json({ error: "Tenant agent config not found" });
    return;
  }

  if (!agentConfig.webhookSecret || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  // ── 2. Validate body ───────────────────────────────────────────────────
  const parsed = whatsappWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { telefone, nome, mensagem } = parsed.data;

  // ── 3. Find or create lead by phone (dedup-aware) ────────────────────
  const normalized = storePhone(telefone);
  const supportIngest = await tryIngestTechnicianSupportMessage({
    tenantId, phone: telefone, text: mensagem, mediaType: "texto", provider: "normalized", log: req.log,
  });
  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone: telefone, text: mensagem, log: req.log });
  if (supportFeedback.handled) {
    res.status(200).json({ supportFeedback: true, ...supportFeedback });
    return;
  }
  const match = await findLeadByDedup(tenantId, telefone, null, null);

  let lead: typeof leadsTable.$inferSelect;
  if (match.found) {
    lead = match.lead;
    await db
      .update(leadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
    req.log.info({ leadId: lead.id, telefone: normalized, matchBy: match.matchBy }, "webhook: existing lead found (dedup)");
  } else {
    [lead] = await db
      .insert(leadsTable)
      .values({ tenantId, nome: nome ?? telefone, telefone: normalized, status: "novo", source: "whatsapp" })
      .returning();
    req.log.info({ leadId: lead.id, telefone: normalized }, "webhook: new lead created");
    await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
  }

  await attributeWhatsAppLeadFromCampaignCode(tenantId, lead.id, mensagem);

  // ── 4. Find or create whatsapp conversation for this lead ──────────────
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, lead.id),
        eq(conversationsTable.channel, "whatsapp")
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", naoLidas: 0 })
      .returning();
    req.log.info(
      { conversationId: conversation.id },
      "webhook: new conversation created"
    );
  }

  // ── 5. Insert incoming message ─────────────────────────────────────────
  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      direcao: "entrada",
      canal: "whatsapp",
      conteudo: mensagem,
      enviadoPor: "lead",
      tipoConteudo: "texto",
      status: "entregue",
    })
    .returning();

  req.log.info({ messageId: message.id }, "webhook: message inserted");

  void recordIntelligenceEvent({
    tenantId,
    leadId: lead.id,
    eventType: "message_received",
    title: "Mensagem recebida via WhatsApp",
    summary: mensagem.slice(0, 500),
    sourceModule: "messages",
    sourceId: message.id,
    metadata: { canal: "whatsapp", direcao: "entrada" },
    log: req.log,
  });
  void resolveStageQuestionsFromInboundMessage({
    tenantId,
    leadId: lead.id,
    messageId: message.id,
    message: mensagem,
    log: req.log,
  }).catch((err) => {
    req.log.warn({ err, messageId: message.id }, "customer-intelligence: WhatsApp stage question resolution failed (non-fatal)");
  });

  void recordIntelligenceFact({
    tenantId,
    leadId: lead.id,
    kind: "declaracao_cliente",
    factKey: "ultima_interacao_cliente",
    value: { canal: "whatsapp", conteudo: mensagem.slice(0, 1000), em: new Date().toISOString() },
    sourceType: "mensagem",
    sourceModule: "messages",
    sourceId: message.id,
    title: "Última interação recebida do cliente",
    log: req.log,
  });

  // ── 6. Update conversation: ultimaMensagemEm + lastInboundAt + naoLidas++ ──
  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      lastInboundAt: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 7. Confirmação de agendamento (SIM/NÃO) — intercept antes do agente ──
  const _apptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);

  if (!_apptHandled) {
    // ── 8. Auto-quote pipeline for leads from WhatsApp channel ─────────
    // Only for leads created by the channel (source === "whatsapp"), not manual leads.
    if (lead.source === "whatsapp") {
      const { generated, message: quoteMessage } = await runAutoQuotePipeline({
        tenantId,
        leadId: lead.id,
        mensagem,
        log: req.log,
      });

      if (generated) {
        // Send the quote summary via WhatsApp
        await sendOutgoingMessage(
          { tenantId, leadId: lead.id, conteudo: quoteMessage, canal: "whatsapp", agentName: "auto-quote" },
          req.log
        );
        req.log.info({ leadId: lead.id }, "webhook: auto-quote sent");
      } else {
        // No quote generated — dispatch AI agent to handle the conversation
        dispatchAgentBackground({
          tenantId,
          leadId: lead.id,
          mensagem,
          log: req.log,
        });
        req.log.info({ leadId: lead.id, conversationId: conversation.id }, "webhook: agent dispatch triggered");
      }
    } else {
      // Manual lead — dispatch AI agent normally (no auto-quote)
      dispatchAgentBackground({
        tenantId,
        leadId: lead.id,
        mensagem,
        log: req.log,
      });
      req.log.info({ leadId: lead.id, conversationId: conversation.id }, "webhook: agent dispatch triggered");
    }
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    leadCreated: !lead.updatedAt || lead.createdAt === lead.updatedAt,
    agentDispatched: true,
  });
});

// ── POST /tenants/:tenantId/webhooks/zapi ────────────────────────────────────
// Receives incoming WhatsApp messages directly from Z-API (native payload).
// Auth: ?secret=<webhookSecret> query param (Z-API doesn't support custom headers).
//
// Z-API v2 payload contract (developer.z-api.io/webhooks/on-message-received-examples):
// - `type` is ALWAYS "ReceivedCallback" for every real inbound message (text, audio, image…)
//   — values like "AudioCallback", "ImageCallback" do NOT exist in real payloads.
// - `isMessage` field does NOT exist in real Z-API payloads; never use it to filter.
// - Content type is identified by which sub-object is present: audio, image, document, text…
const zapiNativeBody = z.object({
  type:             z.string().optional(),   // always "ReceivedCallback" for real messages
  fromMe:           z.boolean().optional(),
  isGroup:          z.boolean().optional(),
  phone:            z.string().optional(),
  participantPhone: z.string().nullable().optional(),
  chatName:         z.string().optional(),
  senderName:       z.string().optional(),
  // Text message — identified by payload.text?.message presence
  text: z.object({ message: z.string() }).optional(),
  body: z.string().optional(),              // fallback: older Z-API text format
  // Audio / PTT — identified by payload.audio?.audioUrl presence
  audio: z.object({
    ptt:      z.boolean().optional(),
    audioUrl: z.string().optional(),
    mimeType: z.string().optional(),
    seconds:  z.number().optional(),
    viewOnce: z.boolean().optional(),
  }).optional(),
  // Image — identified by payload.image?.imageUrl presence
  image: z.object({
    imageUrl: z.string().optional(),
    caption:  z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
  // Document — identified by payload.document?.documentUrl presence
  document: z.object({
    documentUrl: z.string().optional(),
    fileName:    z.string().optional(),
    mimeType:    z.string().optional(),
    caption:     z.string().optional(),
  }).optional(),
  // Video — identified by payload.video?.videoUrl presence
  video: z.object({
    videoUrl: z.string().optional(),
    caption:  z.string().optional(),
    mimeType: z.string().optional(),
    seconds:  z.number().optional(),
  }).optional(),
}).passthrough();

function normalizeZapiPhone(raw: string): string {
  // Strip WhatsApp suffixes: @c.us, @s.whatsapp.net, etc.
  return raw.replace(/@.*$/, "").replace(/\D/g, "");
}

router.post("/tenants/:tenantId/webhooks/zapi", async (req, res) => {
  const tenantId = routeTenantId(req);
  const secret = req.query["secret"];

  // ── 1. Auth via secret query param ────────────────────────────────────────
  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing secret query param" });
    return;
  }

  const [agentConfig] = await db
    .select({ webhookSecret: agentConfigsTable.webhookSecret, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid secret" });
    return;
  }

  // ── 2. Parse payload ───────────────────────────────────────────────────────
  const parsed = zapiNativeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      {
        reason: "invalid_payload",
        bodyPreview: JSON.stringify(req.body)?.slice(0, 300),
        zodIssues: parsed.error.issues.slice(0, 5),
      },
      "zapi-webhook: payload validation failed"
    );
    res.status(200).json({ ignored: true, reason: "invalid_payload" });
    return;
  }

  const payload = parsed.data;

  // ── 3. Guards — block self-echo and group messages ────────────────────────
  // Note: "isMessage" does NOT exist in real Z-API payloads — never use it.

  if (payload.fromMe === true) {
    req.log.info(
      { phone: payload.phone, type: payload.type },
      "zapi-webhook: discarded — fromMe=true (self-echo guard)"
    );
    res.status(200).json({ ignored: true, reason: "fromMe_true" });
    return;
  }

  if (!payload.phone) {
    req.log.info({ type: payload.type }, "zapi-webhook: discarded — no phone field");
    res.status(200).json({ ignored: true, reason: "no_phone" });
    return;
  }

  if (payload.participantPhone || payload.phone.includes("@g.us")) {
    req.log.info(
      { phone: payload.phone, type: payload.type },
      "zapi-webhook: discarded — group message"
    );
    res.status(200).json({ ignored: true, reason: "group_message" });
    return;
  }

  // ── 4. Identify content type by field presence (Z-API v2 ReceivedCallback) ─
  // `type` is always "ReceivedCallback" for real messages — never compare it to
  // identify content. Instead, check which content sub-object is present.

  let mensagem = "";
  let tipoConteudo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";

  if (payload.audio?.audioUrl) {
    // ── Audio / PTT ──────────────────────────────────────────────────────────
    const url = payload.audio.audioUrl;
    req.log.info(
      { phone: payload.phone, ptt: payload.audio.ptt, seconds: payload.audio.seconds, url: url.slice(0, 80) },
      "zapi-webhook: audio — starting transcription"
    );
    try {
      mensagem = await transcribeAudio(url, tenantId, req.log);
      tipoConteudo = "audio";
      req.log.info({ chars: mensagem.length }, "zapi-webhook: audio transcription succeeded");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      req.log.error({ err, url: url.slice(0, 80) }, "zapi-webhook: audio transcription failed");
      res.status(200).json({ ignored: true, reason: "audio_transcription_failed", detail: errMsg });
      return;
    }

  } else if (payload.image?.imageUrl) {
    // ── Image ────────────────────────────────────────────────────────────────
    const url = payload.image.imageUrl;
    req.log.info({ phone: payload.phone, url: url.slice(0, 80) }, "zapi-webhook: image — starting interpretation");
    try {
      mensagem = await interpretImage(url, tenantId, payload.image.caption, req.log);
      tipoConteudo = "imagem";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "zapi-webhook: image interpretation failed");
      res.status(200).json({ ignored: true, reason: "image_interpretation_failed" });
      return;
    }

  } else if (payload.document?.documentUrl) {
    // ── Document ─────────────────────────────────────────────────────────────
    const url = payload.document.documentUrl;
    const mimeType = payload.document.mimeType ?? "";
    const fileName = payload.document.fileName;
    const isSupportedDoc = mimeType.includes("pdf") || mimeType.includes("word") ||
      fileName?.endsWith(".pdf") || fileName?.endsWith(".doc") || fileName?.endsWith(".docx");
    if (!isSupportedDoc) {
      req.log.info({ mimeType, fileName }, "zapi-webhook: unsupported document type");
      res.status(200).json({ ignored: true, reason: "unsupported_document_type" });
      return;
    }
    req.log.info({ phone: payload.phone, fileName, url: url.slice(0, 80) }, "zapi-webhook: document — starting extraction");
    try {
      mensagem = await interpretPdf(url, tenantId, fileName, req.log);
      tipoConteudo = "documento";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "zapi-webhook: document extraction failed");
      res.status(200).json({ ignored: true, reason: "document_extraction_failed" });
      return;
    }

  } else if (payload.video?.videoUrl) {
    // ── Video ────────────────────────────────────────────────────────────────
    mensagem = payload.video.caption?.trim() || "Vídeo enviado pelo WhatsApp";
    tipoConteudo = "video";

  } else if (payload.text?.message || payload.body) {
    // ── Text ─────────────────────────────────────────────────────────────────
    mensagem = payload.text?.message ?? payload.body ?? "";
    tipoConteudo = "texto";

  } else {
    // No recognized content field — log payload keys for future diagnosis
    req.log.info(
      { type: payload.type, phone: payload.phone, payloadKeys: Object.keys(payload as object) },
      "zapi-webhook: discarded — no recognized content field (audio/image/document/text)"
    );
    res.status(200).json({ ignored: true, reason: "no_recognized_content" });
    return;
  }

  if (!mensagem.trim()) {
    res.status(200).json({ ignored: true, reason: "empty_message" });
    return;
  }

  const telefone = normalizeZapiPhone(payload.phone);
  const zapiMediaUrl =
    tipoConteudo === "audio" ? payload.audio?.audioUrl :
    tipoConteudo === "imagem" ? payload.image?.imageUrl :
    tipoConteudo === "video" ? payload.video?.videoUrl :
    tipoConteudo === "documento" ? payload.document?.documentUrl : null;
  const zapiMimeType =
    tipoConteudo === "audio" ? payload.audio?.mimeType :
    tipoConteudo === "imagem" ? payload.image?.mimeType :
    tipoConteudo === "video" ? payload.video?.mimeType :
    tipoConteudo === "documento" ? payload.document?.mimeType : null;
  const zapiFileName =
    tipoConteudo === "audio" ? "audio.ogg" :
    tipoConteudo === "imagem" ? "foto.jpg" :
    tipoConteudo === "video" ? "video.mp4" :
    tipoConteudo === "documento" ? (payload.document?.fileName ?? "documento") : null;
  const supportIngest = await tryIngestTechnicianSupportMessage({
    tenantId,
    phone: telefone,
    text: mensagem,
    mediaUrl: zapiMediaUrl,
    mediaType: tipoConteudo,
    mimeType: zapiMimeType,
    fileName: zapiFileName,
    transcription: tipoConteudo === "audio" ? mensagem : null,
    provider: "zapi",
    log: req.log,
  });
  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone: telefone, text: mensagem, log: req.log });
  if (supportFeedback.handled) {
    res.status(200).json({ supportFeedback: true, ...supportFeedback });
    return;
  }
  const nome = payload.chatName ?? payload.senderName ?? telefone;

  req.log.info({ telefone, nome, tipoConteudo, type: payload.type }, "zapi-webhook: processing message");

  // ── 4-7. Find/create lead, conversa, inserir mensagem ───────────────────
  // CORREÇÃO DE AUDITORIA: até aqui, todo passo de detecção de conteúdo
  // (áudio/imagem/documento) sempre respondia 200 mesmo em erro — mas essa
  // parte central (lead/conversa/mensagem) não tinha a mesma proteção. Se
  // um insert falhasse por qualquer motivo transitório, o handler de erro
  // global (app.ts) devolvia 500 — inconsistente com o resto do arquivo, e
  // arriscado: Z-API reenviaria o mesmo webhook depois de um 500, podendo
  // duplicar lead/mensagem quando o reenvio desse certo.
  let lead: typeof leadsTable.$inferSelect;
  let conversation: typeof conversationsTable.$inferSelect;
  let message: typeof messagesTable.$inferSelect;
  try {
    const normalized = storePhone(telefone);
    const match = await findLeadByDedup(tenantId, telefone, null, null);

    if (match.found) {
      lead = match.lead;
      await db
        .update(leadsTable)
        .set({ updatedAt: new Date() })
        .where(eq(leadsTable.id, lead.id));
      req.log.info({ leadId: lead.id, telefone: normalized, matchBy: match.matchBy }, "zapi-webhook: existing lead found (dedup)");
    } else {
      [lead] = await db
        .insert(leadsTable)
        .values({ tenantId, nome, telefone: normalized, status: "novo", source: "whatsapp" })
        .returning();
      req.log.info({ leadId: lead.id, telefone: normalized }, "zapi-webhook: new lead created");
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
    }

    await attributeWhatsAppLeadFromCampaignCode(tenantId, lead.id, mensagem);

    // ── 5. Find or create whatsapp conversation ──────────────────────────
    const [existingConv] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.tenantId, tenantId),
          eq(conversationsTable.leadId, lead.id),
          eq(conversationsTable.channel, "whatsapp")
        )
      )
      .limit(1);

    if (existingConv) {
      conversation = existingConv;
    } else {
      [conversation] = await db
        .insert(conversationsTable)
        .values({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", naoLidas: 0 })
        .returning();
    }

    // ── 6. Insert incoming message ───────────────────────────────────────
    [message] = await db
      .insert(messagesTable)
      .values({
        tenantId,
        conversationId: conversation.id,
        leadId: lead.id,
        direcao: "entrada",
        canal: "whatsapp",
        conteudo: mensagem,
        enviadoPor: "lead",
        tipoConteudo,
        status: "entregue",
      })
      .returning();

    // ── 7. Update conversation counters ──────────────────────────────────
    await db
      .update(conversationsTable)
      .set({
        ultimaMensagemEm: new Date(),
        lastInboundAt: new Date(),
        naoLidas: sql`${conversationsTable.naoLidas} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversation.id));
  } catch (persistErr) {
    req.log.error({ err: persistErr, tenantId, telefone }, "zapi-webhook: falha ao persistir lead/conversa/mensagem");
    res.status(200).json({ ignored: true, reason: "persist_failed" });
    return;
  }

  // ── 8. Confirmação de agendamento (SIM/NÃO) — intercept antes do agente ──
  const _zapiApptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);

  if (!_zapiApptHandled) {
    // ── 9. Auto-quote pipeline for Z-API channel leads ───────────────────
    if (lead.source === "whatsapp") {
      let autoQuoteHandled = false;
      try {
        const { generated, message: quoteMessage } = await runAutoQuotePipeline({
          tenantId,
          leadId: lead.id,
          mensagem,
          log: req.log,
        });

        if (generated) {
          await sendOutgoingMessage(
            { tenantId, leadId: lead.id, conteudo: quoteMessage, canal: "whatsapp", agentName: "auto-quote" },
            req.log
          );
          req.log.info({ leadId: lead.id }, "zapi-webhook: auto-quote sent");
          autoQuoteHandled = true;
        }
      } catch (autoQuoteErr) {
        req.log.error({ err: autoQuoteErr, leadId: lead.id }, "zapi-webhook: auto-quote pipeline failed — falling back to agent dispatch");
      }

      if (!autoQuoteHandled) {
        dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
        req.log.info({ messageId: message.id, leadId: lead.id }, "zapi-webhook: agent dispatched");
      }
    } else {
      dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
      req.log.info({ messageId: message.id, leadId: lead.id }, "zapi-webhook: agent dispatched");
    }
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    agentDispatched: !_zapiApptHandled,
  });
});

// ── POST /tenants/:tenantId/webhooks/evolution ────────────────────────────────
// Recebe eventos da Evolution API self-hosted (WhatsApp via QR Code) —
// mesmo padrão do webhook zapi acima (lead/conversa/mensagem/dispatch),
// adaptado ao formato de payload da Evolution API v2.
//
// INCERTEZA REAL, documentada aqui por não ter sido testada com uma
// conexão de verdade ainda: o mapeamento exato de campos abaixo segue a
// documentação pública da Evolution API v2 (evento messages.upsert),
// mas pode variar por detalhe de versão. Áudio/imagem/documento buscam
// o conteúdo via GET .../chat/getBase64FromMediaMessage/{instance}
// (endpoint dedicado, não o campo inline do webhook — esse tem bugs
// reportados na Evolution API dependendo da versão, mesmo com
// webhook_base64 ativado). Ainda assim não testado com uma conexão de
// verdade. Confirmar o payload real assim que alguém conectar via QR
// Code e mandar uma mensagem de teste de cada tipo.
router.post("/tenants/:tenantId/webhooks/evolution", async (req, res) => {
  const tenantId = routeTenantId(req);
  const secret = req.query["secret"];

  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing secret query param" });
    return;
  }

  const [agentConfig] = await db
    .select({ webhookSecret: agentConfigsTable.webhookSecret, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid secret" });
    return;
  }

  const body = req.body as { event?: string; instance?: string; data?: Record<string, unknown> };
  const event = body.event ?? "";
  const data = body.data ?? {};
  const requestedConnectionId = typeof req.query["connectionId"] === "string" ? req.query["connectionId"] : null;
  const [evolutionConnection] = await db.select().from(whatsappConnectionsTable).where(and(
    eq(whatsappConnectionsTable.tenantId, tenantId),
    requestedConnectionId
      ? eq(whatsappConnectionsTable.id, requestedConnectionId)
      : eq(whatsappConnectionsTable.evolutionInstanceName, body.instance ?? "")
  )).limit(1);

  // ── connection.update: reflete o estado da conexão (QR escaneado, caiu etc) ──
  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    const state = (data as { state?: string }).state;
    const phone = (data as { wuid?: string; number?: string }).wuid ?? (data as { number?: string }).number ?? null;
    const connected = state === "open";
    if (evolutionConnection) {
      if (connected) {
        await db.update(whatsappConnectionsTable)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(whatsappConnectionsTable.tenantId, tenantId));
      }
      await db.update(whatsappConnectionsTable).set({
        status: connected ? "active" : "disconnected",
        isDefault: connected,
        displayPhoneNumber: connected && phone ? phone.replace(/@.*$/, "").replace(/\D/g, "") : evolutionConnection.displayPhoneNumber,
        disconnectedAt: connected ? null : new Date(), updatedAt: new Date(),
      }).where(eq(whatsappConnectionsTable.id, evolutionConnection.id));
    }
    await db
      .update(agentConfigsTable)
      .set({
        evolutionConnected: connected,
        ...(connected && phone ? { evolutionPhone: phone.replace(/@.*$/, "").replace(/\D/g, "") } : {}),
        ...(!connected ? { evolutionPhone: null } : {}),
      })
      .where(eq(agentConfigsTable.tenantId, tenantId));
    req.log.info({ tenantId, state, connected }, "evolution-webhook: connection.update processado");
    res.status(200).json({ ok: true });
    return;
  }

  // ── messages.upsert: mensagem recebida ────────────────────────────────────
  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") {
    res.status(200).json({ ignored: true, reason: "unhandled_event", event });
    return;
  }

  const key = (data as { key?: { remoteJid?: string; fromMe?: boolean; id?: string } }).key ?? {};

  // ── fromMe=true: o próprio atendente respondeu direto pelo app do
  // WhatsApp (não pelo Vendor.ai) — achado real reportado pelo Marcos:
  // essas mensagens eram descartadas, então a conversa dentro do
  // sistema só mostrava o que o lead falou, nunca o que foi respondido
  // por fora. Grava como saída/humano — sem disparar IA nem auto-quote,
  // é só registro do que já foi enviado de verdade pelo WhatsApp.
  // Cobre texto e mídia (foto/áudio/vídeo/documento) — pra mídia, só
  // baixa e guarda no nosso storage (sem interpretar via IA, isso é
  // só histórico visual, não precisa a IA entender pra responder nada).
  if (key.fromMe === true) {
    const remoteJidOut = key.remoteJid ?? "";
    if (!remoteJidOut || remoteJidOut.includes("@g.us")) {
      res.status(200).json({ ignored: true, reason: remoteJidOut ? "group_message" : "no_remote_jid" });
      return;
    }
    const msgOut = (data as { message?: Record<string, unknown> }).message ?? {};
    let conteudoOut = "";
    let tipoConteudoOut: "texto" | "imagem" | "audio" | "video" | "documento" = "texto";
    let midiaUrlOut: string | null = null;

    async function baixarEArmazenarMidia(mimeTypeFallback: string, fileNameFallback: string): Promise<string | null> {
      const messageIdOut = key.id;
      if (!messageIdOut) return null;
      const media = await getBase64FromMediaMessage(tenantId, messageIdOut, body.instance);
      if (!media.base64) return null;
      const buffer = Buffer.from(media.base64, "base64");
      const objectPath = await objectStorage.savePrivateBuffer(buffer, media.mimetype ?? mimeTypeFallback, fileNameFallback);
      const baseOrigin = `${req.protocol}://${req.get("host")}`;
      return `${baseOrigin}/api/storage${objectPath}`;
    }

    try {
      if (typeof msgOut["conversation"] === "string") {
        conteudoOut = msgOut["conversation"] as string;
      } else if (msgOut["extendedTextMessage"] && typeof (msgOut["extendedTextMessage"] as any).text === "string") {
        conteudoOut = (msgOut["extendedTextMessage"] as any).text;
      } else if (msgOut["imageMessage"]) {
        const caption = (msgOut["imageMessage"] as { caption?: string })?.caption;
        midiaUrlOut = await baixarEArmazenarMidia("image/jpeg", "foto.jpg");
        if (!midiaUrlOut) { res.status(200).json({ ignored: true, reason: "fromMe_media_download_failed" }); return; }
        tipoConteudoOut = "imagem";
        conteudoOut = caption?.trim() || "Foto";
      } else if (msgOut["audioMessage"]) {
        midiaUrlOut = await baixarEArmazenarMidia("audio/ogg", "audio.ogg");
        if (!midiaUrlOut) { res.status(200).json({ ignored: true, reason: "fromMe_media_download_failed" }); return; }
        tipoConteudoOut = "audio";
        conteudoOut = "Áudio";
      } else if (msgOut["videoMessage"]) {
        const caption = (msgOut["videoMessage"] as { caption?: string })?.caption;
        midiaUrlOut = await baixarEArmazenarMidia("video/mp4", "video.mp4");
        if (!midiaUrlOut) { res.status(200).json({ ignored: true, reason: "fromMe_media_download_failed" }); return; }
        tipoConteudoOut = "video";
        conteudoOut = caption?.trim() || "Vídeo";
      } else if (msgOut["documentMessage"]) {
        const docMsg = msgOut["documentMessage"] as { fileName?: string; caption?: string };
        midiaUrlOut = await baixarEArmazenarMidia("application/octet-stream", docMsg?.fileName ?? "documento.bin");
        if (!midiaUrlOut) { res.status(200).json({ ignored: true, reason: "fromMe_media_download_failed" }); return; }
        tipoConteudoOut = "documento";
        conteudoOut = docMsg?.caption?.trim() || docMsg?.fileName || "Documento";
      } else {
        res.status(200).json({ ignored: true, reason: "fromMe_no_recognized_content" });
        return;
      }
    } catch (mediaErr) {
      req.log.error({ err: mediaErr, tenantId }, "evolution-webhook: falha ao baixar mídia fromMe");
      res.status(200).json({ ignored: true, reason: "fromMe_media_processing_failed" });
      return;
    }

    if (!conteudoOut.trim()) {
      res.status(200).json({ ignored: true, reason: "fromMe_empty_message" });
      return;
    }

    const telefoneOut = remoteJidOut.replace(/@.*$/, "").replace(/\D/g, "");
    try {
      const matchOut = await findLeadByDedup(tenantId, telefoneOut, null, null);
      if (!matchOut.found) {
        // Sem lead correspondente (número pessoal, nunca mandou mensagem
        // antes) -- não cria lead nem conversa só pra registrar o que o
        // atendente mandou; não há onde pendurar isso ainda.
        res.status(200).json({ ignored: true, reason: "fromMe_no_matching_lead" });
        return;
      }
      const leadOut = matchOut.lead;

      const [existingConvOut] = await db
        .select()
        .from(conversationsTable)
        .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, leadOut.id), eq(conversationsTable.channel, "whatsapp")))
        .limit(1);
      if (!existingConvOut) {
        res.status(200).json({ ignored: true, reason: "fromMe_no_matching_conversation" });
        return;
      }

      const [messageOut] = await db
        .insert(messagesTable)
        .values({
          tenantId,
          conversationId: existingConvOut.id,
          leadId: leadOut.id,
          direcao: "saida",
          canal: "whatsapp",
          conteudo: conteudoOut,
          enviadoPor: "humano",
          tipoConteudo: tipoConteudoOut,
          midiaUrl: midiaUrlOut,
          status: "entregue",
        })
        .returning();

      await db
        .update(conversationsTable)
        .set({ ultimaMensagemEm: new Date(), updatedAt: new Date() })
        .where(eq(conversationsTable.id, existingConvOut.id));

      req.log.info({ tenantId, leadId: leadOut.id, messageId: messageOut.id, tipoConteudoOut }, "evolution-webhook: mensagem enviada direto pelo WhatsApp (fromMe) registrada como saída/humano");
      res.status(200).json({ leadId: leadOut.id, conversationId: existingConvOut.id, messageId: messageOut.id, fromMe: true });
      return;
    } catch (persistErr) {
      req.log.error({ err: persistErr, tenantId, telefoneOut }, "evolution-webhook: falha ao persistir mensagem fromMe");
      res.status(200).json({ ignored: true, reason: "fromMe_persist_failed" });
      return;
    }
  }

  const remoteJid = key.remoteJid ?? "";
  if (!remoteJid || remoteJid.includes("@g.us")) {
    res.status(200).json({ ignored: true, reason: remoteJid ? "group_message" : "no_remote_jid" });
    return;
  }

  const msg = (data as { message?: Record<string, unknown> }).message ?? {};
  let mensagem = "";
  let tipoConteudo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";
  let midiaUrl: string | null = null;

  // Salva o arquivo original no nosso storage sempre que processar mídia --
  // achado real: a mídia só era baixada pra gerar a descrição da IA
  // (contexto pro agente), a imagem/áudio/documento de verdade nunca
  // ficava salvo nem visível pro atendente, só o texto do resumo.
  async function salvarMidiaOriginal(buffer: Buffer, mimeTypeFallback: string, fileNameFallback: string): Promise<string | null> {
    try {
      const objectPath = await objectStorage.savePrivateBuffer(buffer, mimeTypeFallback, fileNameFallback);
      const baseOrigin = `${req.protocol}://${req.get("host")}`;
      return `${baseOrigin}/api/storage${objectPath}`;
    } catch (err) {
      req.log.error({ err, tenantId }, "evolution-webhook: falha ao salvar mídia original recebida");
      return null;
    }
  }

  if (typeof msg["conversation"] === "string") {
    mensagem = msg["conversation"] as string;
  } else if (msg["extendedTextMessage"] && typeof (msg["extendedTextMessage"] as any).text === "string") {
    mensagem = (msg["extendedTextMessage"] as any).text;
  } else if (msg["audioMessage"]) {
    const messageId = key.id;
    if (!messageId) {
      res.status(200).json({ ignored: true, reason: "audio_no_message_id" });
      return;
    }
    req.log.info({ tenantId, remoteJid }, "evolution-webhook: audio — buscando base64 e transcrevendo");
    try {
      const media = await getBase64FromMediaMessage(tenantId, messageId, body.instance);
      if (!media.base64) throw new Error("base64 vazio retornado pela Evolution API");
      const buffer = Buffer.from(media.base64, "base64");
      mensagem = await transcribeAudioBuffer(buffer, tenantId, req.log);
      tipoConteudo = "audio";
      midiaUrl = await salvarMidiaOriginal(buffer, media.mimetype ?? "audio/ogg", "audio.ogg");
    } catch (err) {
      req.log.error({ err, tenantId, remoteJid }, "evolution-webhook: falha ao processar áudio");
      res.status(200).json({ ignored: true, reason: "audio_processing_failed" });
      return;
    }
  } else if (msg["imageMessage"]) {
    const messageId = key.id;
    if (!messageId) {
      res.status(200).json({ ignored: true, reason: "image_no_message_id" });
      return;
    }
    const caption = (msg["imageMessage"] as { caption?: string })?.caption;
    req.log.info({ tenantId, remoteJid }, "evolution-webhook: imagem — buscando base64 e interpretando");
    try {
      const media = await getBase64FromMediaMessage(tenantId, messageId, body.instance);
      if (!media.base64) throw new Error("base64 vazio retornado pela Evolution API");
      const buffer = Buffer.from(media.base64, "base64");
      const dataUrl = `data:${media.mimetype ?? "image/jpeg"};base64,${media.base64}`;
      mensagem = await interpretImage(dataUrl, tenantId, caption, req.log);
      tipoConteudo = "imagem";
      midiaUrl = await salvarMidiaOriginal(buffer, media.mimetype ?? "image/jpeg", "foto.jpg");
    } catch (err) {
      req.log.error({ err, tenantId, remoteJid }, "evolution-webhook: falha ao processar imagem");
      res.status(200).json({ ignored: true, reason: "image_processing_failed" });
      return;
    }
  } else if (msg["videoMessage"]) {
    const messageId = key.id;
    if (!messageId) {
      res.status(200).json({ ignored: true, reason: "video_no_message_id" });
      return;
    }
    const videoMsg = msg["videoMessage"] as { caption?: string; mimetype?: string };
    try {
      const media = await getBase64FromMediaMessage(tenantId, messageId, body.instance);
      if (!media.base64) throw new Error("base64 vazio retornado pela Evolution API");
      const buffer = Buffer.from(media.base64, "base64");
      mensagem = videoMsg?.caption?.trim() || "Vídeo enviado pelo WhatsApp";
      tipoConteudo = "video";
      midiaUrl = await salvarMidiaOriginal(buffer, media.mimetype ?? videoMsg?.mimetype ?? "video/mp4", "video.mp4");
    } catch (err) {
      req.log.error({ err, tenantId, remoteJid }, "evolution-webhook: falha ao processar vídeo");
      res.status(200).json({ ignored: true, reason: "video_processing_failed" });
      return;
    }
  } else if (msg["documentMessage"]) {
    const messageId = key.id;
    const docMsg = msg["documentMessage"] as { mimetype?: string; fileName?: string };
    const mimeType = docMsg?.mimetype ?? "";
    const fileName = docMsg?.fileName;
    const isSupportedDoc = mimeType.includes("pdf") || mimeType.includes("word") ||
      fileName?.endsWith(".pdf") || fileName?.endsWith(".doc") || fileName?.endsWith(".docx");
    if (!messageId || !isSupportedDoc) {
      req.log.info({ tenantId, remoteJid, mimeType, fileName }, "evolution-webhook: documento não suportado ou sem messageId");
      res.status(200).json({ ignored: true, reason: "unsupported_document_type" });
      return;
    }
    req.log.info({ tenantId, remoteJid, fileName }, "evolution-webhook: documento — buscando base64 e extraindo texto");
    try {
      const media = await getBase64FromMediaMessage(tenantId, messageId, body.instance);
      if (!media.base64) throw new Error("base64 vazio retornado pela Evolution API");
      const buffer = Buffer.from(media.base64, "base64");
      mensagem = await interpretPdfBuffer(buffer, fileName, req.log);
      tipoConteudo = "documento";
      midiaUrl = await salvarMidiaOriginal(buffer, mimeType || "application/octet-stream", fileName ?? "documento.pdf");
    } catch (err) {
      req.log.error({ err, tenantId, remoteJid }, "evolution-webhook: falha ao processar documento");
      res.status(200).json({ ignored: true, reason: "document_processing_failed" });
      return;
    }
  } else {
    req.log.info({ tenantId, remoteJid, messageKeys: Object.keys(msg) }, "evolution-webhook: descartado — nenhum campo de conteúdo reconhecido");
    res.status(200).json({ ignored: true, reason: "no_recognized_content" });
    return;
  }

  if (!mensagem.trim()) {
    res.status(200).json({ ignored: true, reason: "empty_message" });
    return;
  }

  const telefone = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
  const evolutionFileName =
    tipoConteudo === "audio" ? "audio.ogg" :
    tipoConteudo === "imagem" ? "foto.jpg" :
    tipoConteudo === "video" ? "video.mp4" :
    tipoConteudo === "documento" ? ((msg["documentMessage"] as { fileName?: string } | undefined)?.fileName ?? "documento") : null;
  const evolutionMimeType =
    tipoConteudo === "audio" ? "audio/ogg" :
    tipoConteudo === "imagem" ? "image/jpeg" :
    tipoConteudo === "video" ? "video/mp4" :
    tipoConteudo === "documento" ? ((msg["documentMessage"] as { mimetype?: string } | undefined)?.mimetype ?? "application/octet-stream") : null;
  const supportIngest = await tryIngestTechnicianSupportMessage({
    tenantId,
    phone: telefone,
    text: mensagem,
    mediaUrl: midiaUrl,
    mediaType: tipoConteudo,
    mimeType: evolutionMimeType,
    fileName: evolutionFileName,
    transcription: tipoConteudo === "audio" ? mensagem : null,
    sourceMessageId: key.id ?? null,
    provider: "evolution",
    log: req.log,
  });
  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone: telefone, text: mensagem, log: req.log });
  if (supportFeedback.handled) {
    res.status(200).json({ supportFeedback: true, ...supportFeedback });
    return;
  }
  const nome = (data as { pushName?: string }).pushName ?? telefone;

  req.log.info({ telefone, nome, tipoConteudo }, "evolution-webhook: processing message");

  let lead: typeof leadsTable.$inferSelect;
  let conversation: typeof conversationsTable.$inferSelect;
  let message: typeof messagesTable.$inferSelect;
  try {
    const normalized = storePhone(telefone);
    const match = await findLeadByDedup(tenantId, telefone, null, null);

    if (match.found) {
      lead = match.lead;
      await db.update(leadsTable).set({ updatedAt: new Date(), ...(evolutionConnection?.assignedUserId ? { assignedTo: evolutionConnection.assignedUserId } : {}) }).where(eq(leadsTable.id, lead.id));
    } else {
      [lead] = await db
        .insert(leadsTable)
        .values({ tenantId, nome, telefone: normalized, status: "novo", source: "whatsapp", assignedTo: evolutionConnection?.assignedUserId ?? null })
        .returning();
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento", assignedTo: evolutionConnection?.assignedUserId ?? null });
    }

    const [existingConv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, lead.id), eq(conversationsTable.channel, "whatsapp"), evolutionConnection ? eq(conversationsTable.whatsappConnectionId, evolutionConnection.id) : isNull(conversationsTable.whatsappConnectionId)))
      .limit(1);

    if (existingConv) {
      conversation = existingConv;
    } else {
      [conversation] = await db
        .insert(conversationsTable)
        .values({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", naoLidas: 0, assignedTo: evolutionConnection?.assignedUserId ?? null, whatsappConnectionId: evolutionConnection?.id ?? null })
        .returning();
    }

    [message] = await db
      .insert(messagesTable)
      .values({
        tenantId,
        conversationId: conversation.id,
        leadId: lead.id,
        direcao: "entrada",
        canal: "whatsapp",
        conteudo: mensagem,
        enviadoPor: "lead",
        tipoConteudo,
        midiaUrl,
        status: "entregue",
      })
      .returning();

    await db
      .update(conversationsTable)
      .set({
        ultimaMensagemEm: new Date(),
        assignedTo: evolutionConnection?.assignedUserId ?? conversation.assignedTo,
        lastInboundAt: new Date(),
        naoLidas: sql`${conversationsTable.naoLidas} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversation.id));
  } catch (persistErr) {
    req.log.error({ err: persistErr, tenantId, telefone }, "evolution-webhook: falha ao persistir lead/conversa/mensagem");
    res.status(200).json({ ignored: true, reason: "persist_failed" });
    return;
  }

  const _evoApptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);

  if (!_evoApptHandled) {
    let autoQuoteHandled = false;
    try {
      const { generated, message: quoteMessage } = await runAutoQuotePipeline({ tenantId, leadId: lead.id, mensagem, log: req.log });
      if (generated) {
        await sendOutgoingMessage({ tenantId, leadId: lead.id, conteudo: quoteMessage, canal: "whatsapp", agentName: "auto-quote" }, req.log);
        autoQuoteHandled = true;
      }
    } catch (autoQuoteErr) {
      req.log.error({ err: autoQuoteErr, leadId: lead.id }, "evolution-webhook: auto-quote pipeline failed — falling back to agent dispatch");
    }

    if (!autoQuoteHandled) {
      dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
    }
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    agentDispatched: !_evoApptHandled,
  });
});

// ── POST /tenants/:tenantId/webhooks/instagram ───────────────────────────────
// Receives Instagram DM events forwarded by Meta webhook (via n8n or directly).
// Payload shape mirrors Meta's Messenger/Instagram webhook format.
const instagramWebhookBody = z.object({
  igsid: z.string().min(1),           // Instagram Scoped User ID of the sender
  nome: z.string().optional(),
  mensagem: z.string().min(1),
  instagramConnectionId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
});

router.post("/tenants/:tenantId/webhooks/instagram", async (req, res) => {
  const tenantId = routeTenantId(req);
  const secret = req.headers["x-webhook-secret"];

  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing X-Webhook-Secret header" });
    return;
  }

  const [agentConfig] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig) {
    res.status(404).json({ error: "Tenant agent config not found" });
    return;
  }

  if (!agentConfig.webhookSecret || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const parsed = instagramWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { igsid, nome, mensagem, instagramConnectionId, accountId } = parsed.data;

  const [incomingInstagramConnection] = await db
    .select({
      id: instagramConnectionsTable.id,
      accountId: instagramConnectionsTable.accountId,
      username: instagramConnectionsTable.username,
    })
    .from(instagramConnectionsTable)
    .where(and(
      eq(instagramConnectionsTable.tenantId, tenantId),
      isNull(instagramConnectionsTable.disconnectedAt),
      ...(instagramConnectionId
        ? [eq(instagramConnectionsTable.id, instagramConnectionId)]
        : accountId
          ? [eq(instagramConnectionsTable.accountId, accountId)]
          : []),
    ))
    .limit(1);

  // Find or create lead by Instagram Scoped ID (dedup-aware)
  let [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, igsid))
    )
    .limit(1);

  if (!lead) {
    // Dedup check: name-only match must NOT auto-merge; create separate lead
    // and flag as possible duplicate for manual review
    const match = await findLeadByDedup(tenantId, null, null, nome);
    if (match.found === false && match.similar !== null) {
      // Similar name found — create NEW lead, mark as possible duplicate
      const similarId = match.similar.id;
      [lead] = await db
        .insert(leadsTable)
        .values({
          tenantId,
          nome: nome ?? `Instagram @${igsid.slice(0, 8)}`,
          instagramScopedId: igsid,
          status: "novo",
          source: "instagram",
          possivelDuplicata: true,
          leadSimilarId: similarId,
        })
        .returning();
      req.log.info({ leadId: lead.id, igsid, similarId, matchBy: "nome" }, "webhook/instagram: new lead created, flagged as possible duplicate (name-only match)");
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
    } else {
      [lead] = await db
        .insert(leadsTable)
        .values({ tenantId, nome: nome ?? `Instagram @${igsid.slice(0, 8)}`, instagramScopedId: igsid, status: "novo", source: "instagram" })
        .returning();
      req.log.info({ leadId: lead.id, igsid }, "webhook/instagram: new lead created");
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
    }
  } else if (!lead.instagramScopedId) {
    // Backfill if lead existed without IGSID
    await db
      .update(leadsTable)
      .set({ instagramScopedId: igsid, updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
  } else {
    // Lead reused by IGSID — bump updatedAt
    await db
      .update(leadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
  }

  // ── Find or create Instagram conversation ────────────────────────────────
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, lead.id),
        eq(conversationsTable.channel, "instagram")
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({
        tenantId,
        leadId: lead.id,
        channel: "instagram",
        status: "open",
        naoLidas: 0,
        metadata: {
          instagramConnectionId: incomingInstagramConnection?.id ?? instagramConnectionId ?? null,
          instagramAccountId: incomingInstagramConnection?.accountId ?? accountId ?? null,
          instagramScopedId: igsid,
        },
      })
      .returning();
    req.log.info({ conversationId: conversation.id }, "webhook/instagram: new conversation created");
  }

  if (conversation) {
    const currentMetadata = conversation.metadata && typeof conversation.metadata === "object"
      ? conversation.metadata as Record<string, unknown>
      : {};
    const nextMetadata = {
      ...currentMetadata,
      instagramConnectionId: incomingInstagramConnection?.id ?? instagramConnectionId ?? currentMetadata["instagramConnectionId"] ?? null,
      instagramAccountId: incomingInstagramConnection?.accountId ?? accountId ?? currentMetadata["instagramAccountId"] ?? null,
      instagramScopedId: igsid,
    };
    await db.update(conversationsTable)
      .set({ metadata: nextMetadata, updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversation.id));
    conversation = { ...conversation, metadata: nextMetadata };
  }

  // ── Insert incoming message ──────────────────────────────────────────────
  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      direcao: "entrada",
      canal: "instagram",
      conteudo: mensagem,
      enviadoPor: "lead",
      tipoConteudo: "texto",
      status: "entregue",
    })
    .returning();

  req.log.info({ messageId: message.id }, "webhook/instagram: message inserted");

  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // Auto-quote pipeline for Instagram channel leads
  if (lead.source === "instagram") {
    const { generated, message: quoteMessage } = await runAutoQuotePipeline({
      tenantId,
      leadId: lead.id,
      mensagem,
      log: req.log,
    });

    if (generated) {
      await sendOutgoingMessage(
        {
          tenantId,
          leadId: lead.id,
          conteudo: quoteMessage,
          canal: "instagram",
          agentName: "auto-quote",
          instagramConnectionId: incomingInstagramConnection?.id ?? instagramConnectionId,
        },
        req.log
      );
      req.log.info({ leadId: lead.id }, "webhook/instagram: auto-quote sent");
    } else {
      dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
      req.log.info({ messageId: message.id, leadId: lead.id }, "webhook/instagram: agent dispatched");
    }
  } else {
    dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
    req.log.info({ messageId: message.id, leadId: lead.id }, "webhook/instagram: agent dispatched");
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    agentDispatched: true,
  });
});

// ── POST /tenants/:tenantId/messages/send ─────────────────────────────────────
const sendMessageBody = z.object({
  leadId: z.string().min(1),
  conteudo: z.string().min(1),
  canal: z
    .enum(["whatsapp", "instagram", "email", "chat"])
    .optional()
    .default("whatsapp"),
  agentName: z.string().optional(),
});

router.post("/tenants/:tenantId/messages/send", async (req, res) => {
  const tenantId = routeTenantId(req);

  // ── 1. Dual auth ───────────────────────────────────────────────────────
  const authorized = await dualAuth(req, res, tenantId);
  if (!authorized) return;

  // ── 2. Validate body ───────────────────────────────────────────────────
  const parsed = sendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // ── 3. Execute via shared service ──────────────────────────────────────
  try {
    const { message, telefoneDestino } = await sendOutgoingMessage(
      { ...parsed.data, tenantId },
      req.log
    );
    res.status(201).json({ ...message, telefoneDestino });
  } catch (err) {
    if (err instanceof LeadNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InstagramNotConnectedError || err instanceof InstagramScopedIdMissingError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── POST /webhooks/asaas ──────────────────────────────────────────────────────
// Asaas sends payment events here. No auth — protected by checking event metadata.
// Relevant events:
//   PAYMENT_OVERDUE   → if overdue ≥ 3 days, suspend tenant
//   PAYMENT_RECEIVED  → reactivate tenant + mark billing_event as paid
//   PAYMENT_CONFIRMED → same as RECEIVED

const asaasWebhookBody = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    externalReference: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    status: z.string().optional(),
    value: z.number().optional(),
    netValue: z.number().optional(),
  }),
});

router.post("/webhooks/asaas", async (req, res) => {
  const expectedToken = process.env.ASAAS_WEBHOOK_ACCESS_TOKEN;
  if (expectedToken && req.header("asaas-access-token") !== expectedToken) {
    res.status(401).json({ error: "Invalid Asaas webhook token" });
    return;
  }
  const parsed = asaasWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid payload" });
    return;
  }

  const { event, payment } = parsed.data;
  req.log.info({ event, paymentId: payment.id }, "asaas-webhook: received");

  // Resolve tenantId from the billing_event linked to this charge
  const [billingEvent] = await db
    .select({ id: billingEventsTable.id, tenantId: billingEventsTable.tenantId })
    .from(billingEventsTable)
    .where(eq(billingEventsTable.asaasChargeId, payment.id))
    .limit(1);

  // Also try via externalReference for monthly charges (format: "monthly:<tenantId>:<mes>")
  let tenantId: string | null = billingEvent?.tenantId ?? null;
  if (!tenantId && payment.externalReference?.startsWith("monthly:")) {
    const parts = payment.externalReference.split(":");
    tenantId = parts[1] ?? null;
  }

  // Resolve a deal linked to this charge (customer-level cobrança, distinct from
  // the tenant's own subscription billing above). externalReference is either
  // the bare dealId (single payment) or `${dealId}-${parcela}` (installments);
  // dealId is always a 36-char crypto.randomUUID().
  let linkedDealId: string | null = null;
  const isKnownPrefixedRef =
    payment.externalReference?.startsWith("monthly:") ||
    payment.externalReference?.startsWith("token_topup:") ||
    payment.externalReference?.startsWith("sku_delivery:");
  if (!isKnownPrefixedRef && payment.externalReference) {
    if (payment.externalReference.length === 36) {
      linkedDealId = payment.externalReference;
    } else if (payment.externalReference.length > 36 && payment.externalReference[36] === "-") {
      linkedDealId = payment.externalReference.slice(0, 36);
    }
  }

  const [linkedDeal] = linkedDealId
    ? await db
        .select({ id: dealsTable.id, tenantId: dealsTable.tenantId })
        .from(dealsTable)
        .where(eq(dealsTable.id, linkedDealId))
        .limit(1)
    : await db
        .select({ id: dealsTable.id, tenantId: dealsTable.tenantId })
        .from(dealsTable)
        .where(eq(dealsTable.asaasChargeId, payment.id))
        .limit(1);

  // ERP receivables use externalReference `erp_titulo:<id>` and retain the
  // provider id. The event table is the idempotency gate for webhook retries.
  const erpTitleId = payment.externalReference?.startsWith("erp_titulo:")
    ? payment.externalReference.slice("erp_titulo:".length)
    : null;
  const [erpTitle] = await db.select().from(erpTitulosTable).where(
    erpTitleId ? eq(erpTitulosTable.id, erpTitleId) : eq(erpTitulosTable.provedorCobrancaId, payment.id)
  ).limit(1);
  if (erpTitle) tenantId = erpTitle.tenantId;

  const eventKey = `${event}:${payment.id}`;
  const insertedEvent = await db.insert(erpIntegracaoEventosTable).values({tenantId,provedor:"asaas",eventoId:eventKey,tipo:event,payload:req.body}).onConflictDoNothing().returning({id:erpIntegracaoEventosTable.id});
  if (!insertedEvent.length) { res.status(200).json({ok:true,duplicate:true}); return; }

  if (erpTitle && (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED")) {
    const due = Number(erpTitle.valorOriginal)+Number(erpTitle.juros)+Number(erpTitle.multa)-Number(erpTitle.desconto);
    const amount = Math.min(payment.value ?? due, Math.max(0,due-Number(erpTitle.valorPago)));
    if (amount > 0) await db.transaction(async tx=>{
      await tx.insert(erpPagamentosTable).values({tenantId:erpTitle.tenantId,tituloId:erpTitle.id,valor:String(amount),forma:"asaas",conciliacaoId:payment.id});
      const paid=Number(erpTitle.valorPago)+amount;
      await tx.update(erpTitulosTable).set({valorPago:String(paid),status:paid>=due?"pago":erpTitle.status,pagoEm:paid>=due?new Date():erpTitle.pagoEm,updatedAt:new Date()}).where(eq(erpTitulosTable.id,erpTitle.id));
    });
  } else if (erpTitle && event === "PAYMENT_OVERDUE") {
    await db.update(erpTitulosTable).set({status:"vencido",updatedAt:new Date()}).where(eq(erpTitulosTable.id,erpTitle.id));
  }

  if (linkedDeal) {
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      await db
        .update(dealsTable)
        .set({ chargeStatus: "paid", updatedAt: new Date() })
        .where(eq(dealsTable.id, linkedDeal.id));
      req.log.info({ dealId: linkedDeal.id, paymentId: payment.id }, "asaas-webhook: deal charge marked paid");
    } else if (event === "PAYMENT_OVERDUE") {
      if (payment.dueDate) {
        const due = new Date(payment.dueDate);
        const threeDaysAfterDue = new Date(due);
        threeDaysAfterDue.setDate(threeDaysAfterDue.getDate() + 3);
        if (new Date() >= threeDaysAfterDue) {
          await db
            .update(dealsTable)
            .set({ chargeStatus: "overdue", updatedAt: new Date() })
            .where(eq(dealsTable.id, linkedDeal.id));
          req.log.warn({ dealId: linkedDeal.id, paymentId: payment.id }, "asaas-webhook: deal charge marked overdue ≥3 days");
        }
      }
    }
  }

  if (!tenantId) {
    if (!linkedDeal) {
      req.log.warn({ paymentId: payment.id }, "asaas-webhook: no tenant found for payment — ignoring");
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    // ── Token top-up: credit tokens to tenant ──────────────────────────────
    if (payment.externalReference?.startsWith("token_topup:")) {
      const parts = payment.externalReference.split(":");
      const purchaseId = parts[2] ?? null;
      if (purchaseId) {
        const [purchase] = await db
          .select({ id: tokenPurchasesTable.id, credits: tokenPurchasesTable.credits, status: tokenPurchasesTable.status })
          .from(tokenPurchasesTable)
          .where(eq(tokenPurchasesTable.id, purchaseId));

        if (purchase && purchase.status !== "paid") {
          await db
            .update(tokenPurchasesTable)
            .set({ status: "paid", paidAt: new Date() })
            .where(eq(tokenPurchasesTable.id, purchase.id));

          await db
            .update(tenantsTable)
            .set({ tokenCredits: sql`token_credits + ${purchase.credits}`, updatedAt: new Date() })
            .where(eq(tenantsTable.id, tenantId));

          await db.insert(vendorTokenTransactionsTable).values({
            tenantId,
            tokensDelta: purchase.credits,
            kind: "purchase",
            source: "asaas_token_purchase",
            referenceId: purchase.id,
            metadata: { paymentId: payment.id, canonical: true },
          }).onConflictDoNothing();

          req.log.info({ tenantId, purchaseId, tokens: purchase.credits }, "asaas-webhook: token top-up credited");
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    // ── SKU-based product delivery ──────────────────────────────────────────
    if (payment.externalReference?.startsWith("sku_delivery:")) {
      const propostaId = payment.externalReference.split(":")[1] ?? null;
      if (propostaId) {
        req.log.info({ propostaId, paymentId: payment.id }, "asaas-webhook: sku_delivery triggered");
        void dispatchSkuDelivery(propostaId).catch((err) =>
          req.log.error({ err, propostaId }, "asaas-webhook: sku_delivery failed")
        );
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Mark billing_event paid
    if (billingEvent) {
      await db
        .update(billingEventsTable)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(billingEventsTable.id, billingEvent.id));
    }

    // Reactivate tenant if it was suspended due to overdue
    await db
      .update(tenantsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.status, "suspended")));

    req.log.info({ tenantId, paymentId: payment.id }, "asaas-webhook: payment received — tenant reactivated if suspended");
  } else if (event === "PAYMENT_OVERDUE") {
    // Only suspend if overdue by ≥ 3 calendar days
    if (payment.dueDate) {
      const due = new Date(payment.dueDate);
      const threeDaysAfterDue = new Date(due);
      threeDaysAfterDue.setDate(threeDaysAfterDue.getDate() + 3);

      if (new Date() >= threeDaysAfterDue) {
        if (billingEvent) {
          await db
            .update(billingEventsTable)
            .set({ status: "overdue" })
            .where(eq(billingEventsTable.id, billingEvent.id));
        }

        await db
          .update(tenantsTable)
          .set({ status: "suspended", updatedAt: new Date() })
          .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.status, "active")));

        req.log.warn({ tenantId, paymentId: payment.id, dueDate: payment.dueDate }, "asaas-webhook: payment overdue ≥3 days — tenant suspended");
      } else {
        req.log.info({ tenantId, paymentId: payment.id }, "asaas-webhook: payment overdue but < 3 days — not suspending yet");
      }
    }
  }

  res.status(200).json({ ok: true });
});

// ── GET /webhooks/meta/whatsapp — Meta webhook URL verification ──────────────
router.get("/webhooks/meta/whatsapp", async (req, res) => {
  const mode      = String(req.query["hub.mode"] ?? "");
  const token     = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (mode !== "subscribe" || !token) {
    res.status(400).json({ error: "Invalid verification request" });
    return;
  }

  // A assinatura do app acontece antes da primeira conta de tenant ser
  // conectada. Por isso, aceita primeiro o token global configurado no
  // Railway e mantém o token por tenant como compatibilidade.
  const envToken = process.env["WHATSAPP_VERIFY_TOKEN"];
  let verified = Boolean(envToken && token === envToken);

  if (!verified) {
    const [config] = await db
      .select({ id: agentConfigsTable.id })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.metaVerifyToken, token))
      .limit(1);
    verified = Boolean(config);
  }

  if (!verified) {
    // Nunca registre o token recebido: ele funciona como segredo compartilhado.
    req.log.warn({ mode }, "meta-webhook: verify_token mismatch");
    res.status(403).json({ error: "verify_token mismatch" });
    return;
  }

  req.log.info("meta-webhook: webhook URL verified successfully");
  res.status(200).send(challenge);
});

// ── POST /webhooks/meta/whatsapp — incoming Meta WhatsApp messages ───────────
router.post("/webhooks/meta/whatsapp", async (req, res) => {
  // ACK immediately — Meta retries if it doesn't get 200 within 20s
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as Record<string, unknown>;
    if (body.object !== "whatsapp_business_account") return;

    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
      for (const change of changes) {
        const value    = change.value as Record<string, unknown>;
        const field = String(change.field ?? "");
        if (field !== "messages" && field !== "calls") continue;
        const metadata = (value.metadata ?? {}) as Record<string, string>;
        const phoneNumberId = metadata["phone_number_id"];
        if (!phoneNumberId) continue;

        // O app Meta e compartilhado, mas cada numero e token pertencem a um tenant.
        const [whatsappConnection] = await db
          .select({
            id: whatsappConnectionsTable.id,
            tenantId: whatsappConnectionsTable.tenantId,
            assignedUserId: whatsappConnectionsTable.assignedUserId,
            metaAccessToken: whatsappConnectionsTable.accessToken,
          })
          .from(whatsappConnectionsTable)
          .where(and(
            eq(whatsappConnectionsTable.phoneNumberId, phoneNumberId),
            eq(whatsappConnectionsTable.status, "active"),
            isNull(whatsappConnectionsTable.disconnectedAt),
          ))
          .limit(1);
        if (!whatsappConnection) {
          req.log.warn({ phoneNumberId }, "meta-webhook: no tenant found for phoneNumberId");
          continue;
        }
        const { tenantId } = whatsappConnection;

        if (field === "calls") {
          void handleMetaCallWebhook({
            value,
            phoneNumberId,
            whatsappConnection: {
              tenantId,
              metaAccessToken: whatsappConnection.metaAccessToken,
            },
            log: req.log,
          }).catch((error) => {
            req.log.error({ error, phoneNumberId, tenantId }, "meta-calling: webhook handling failed");
          });
          continue;
        }

        const incomingMsgs = (value.messages ?? []) as Array<Record<string, unknown>>;
        const contacts     = (value.contacts ?? []) as Array<Record<string, unknown>>;

        for (const msg of incomingMsgs) {
          const msgType   = msg["type"] as string;
          const phone     = String(msg["from"] ?? "");
          if (!phone) continue;

          const senderName = (contacts[0] as any)?.profile?.name as string | undefined;

          let mensagem     = "";
          let tipoConteudo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";
          let midiaUrl: string | null = null;
          let midiaMimeType: string | null = null;
          let midiaFileName: string | null = null;
          let midiaSize: number | null = null;

          async function salvarMetaMidia(buffer: Buffer, mimeType: string, fileName: string) {
            const objectPath = await objectStorage.savePrivateBuffer(buffer, mimeType, fileName);
            midiaUrl = `/api/storage${objectPath}`;
            midiaMimeType = mimeType;
            midiaFileName = fileName;
            midiaSize = buffer.length;
          }

          if (msgType === "text") {
            mensagem = ((msg["text"] as Record<string, string>)?.body) ?? "";
            if (!mensagem) continue;

          } else if (msgType === "audio" || msgType === "voice") {
            if (!whatsappConnection.metaAccessToken) {
              req.log.warn({ phone, msgType }, "meta-webhook: audio received but no access token — skipping");
              continue;
            }
            const audioData = ((msg["audio"] ?? msg["voice"]) as Record<string, string>) ?? {};
            const audioId = audioData.id;
            if (!audioId) continue;
            try {
              const buf = await downloadMetaMedia(audioId, whatsappConnection.metaAccessToken);
              mensagem = await transcribeAudioBuffer(buf, tenantId, req.log);
              tipoConteudo = "audio";
              await salvarMetaMidia(buf, audioData.mime_type || "audio/ogg", "audio.ogg");
              req.log.info({ audioId, chars: mensagem.length }, "meta-webhook: audio transcribed");
            } catch (err) {
              req.log.error({ err, audioId }, "meta-webhook: audio transcription failed — skipping");
              continue;
            }

          } else if (msgType === "image") {
            if (!whatsappConnection.metaAccessToken) {
              req.log.warn({ phone }, "meta-webhook: image received but no access token — skipping");
              continue;
            }
            const imageData = (msg["image"] as Record<string, string>) ?? {};
            const imageId   = imageData.id;
            const caption   = imageData.caption;
            const mimeType  = (imageData as any).mime_type as string || "image/jpeg";
            if (!imageId) continue;
            try {
              const buf    = await downloadMetaMedia(imageId, whatsappConnection.metaAccessToken);
              const dataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
              mensagem = await interpretImage(dataUrl, tenantId, caption, req.log);
              tipoConteudo = "imagem";
              await salvarMetaMidia(buf, mimeType, "foto.jpg");
              req.log.info({ imageId, chars: mensagem.length }, "meta-webhook: image interpreted");
            } catch (err) {
              req.log.error({ err, imageId }, "meta-webhook: image interpretation failed — skipping");
              continue;
            }

          } else if (msgType === "video") {
            if (!whatsappConnection.metaAccessToken) {
              req.log.warn({ phone }, "meta-webhook: video received but no access token — skipping");
              continue;
            }
            const videoData = (msg["video"] as Record<string, string>) ?? {};
            const videoId = videoData.id;
            if (!videoId) continue;
            try {
              const buf = await downloadMetaMedia(videoId, whatsappConnection.metaAccessToken);
              mensagem = videoData.caption?.trim() || "Vídeo enviado pelo WhatsApp";
              tipoConteudo = "video";
              await salvarMetaMidia(buf, videoData.mime_type || "video/mp4", "video.mp4");
            } catch (err) {
              req.log.error({ err, videoId }, "meta-webhook: video download failed — skipping");
              continue;
            }

          } else if (msgType === "document") {
            if (!whatsappConnection.metaAccessToken) {
              req.log.warn({ phone }, "meta-webhook: document received but no access token — skipping");
              continue;
            }
            const documentData = (msg["document"] as Record<string, string>) ?? {};
            const documentId = documentData.id;
            const fileName = documentData.filename || "documento";
            const mimeType = documentData.mime_type || "application/octet-stream";
            if (!documentId) continue;
            try {
              const buf = await downloadMetaMedia(documentId, whatsappConnection.metaAccessToken);
              const supportedForText = mimeType.includes("pdf") || mimeType.includes("word") || /\.(pdf|doc|docx)$/i.test(fileName);
              mensagem = supportedForText
                ? await interpretPdfBuffer(buf, fileName, req.log)
                : (documentData.caption?.trim() || `Documento: ${fileName}`);
              tipoConteudo = "documento";
              await salvarMetaMidia(buf, mimeType, fileName);
            } catch (err) {
              req.log.error({ err, documentId }, "meta-webhook: document processing failed — skipping");
              continue;
            }

          } else {
            req.log.info({ type: msgType, phone }, "meta-webhook: unsupported message type — skipping");
            continue;
          }

          if (!mensagem.trim()) continue;

          const supportIngest = await tryIngestTechnicianSupportMessage({
            tenantId,
            phone,
            text: mensagem,
            mediaUrl: midiaUrl,
            mediaType: tipoConteudo,
            mimeType: midiaMimeType,
            fileName: midiaFileName,
            fileSize: midiaSize,
            transcription: tipoConteudo === "audio" ? mensagem : null,
            sourceMessageId: String(msg["id"] ?? "") || null,
            provider: "meta",
            log: req.log,
          });
          if (supportIngest.handled) {
            req.log.info({ supportIngest, phone }, "meta-webhook: atualização de técnico absorvida pela assistência");
            continue;
          }
          const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone, text: mensagem, log: req.log });
          if (supportFeedback.handled) {
            req.log.info({ supportFeedback, phone }, "meta-webhook: feedback da assistência processado");
            continue;
          }

          // Find or create lead (dedup by normalized phone)
          const normalized = storePhone(phone) ?? phone;
          const match = await findLeadByDedup(tenantId, normalized, null, senderName ?? null);

          let lead: typeof leadsTable.$inferSelect | null = null;

          if (match.found === true) {
            lead = match.lead;
            await db
              .update(leadsTable)
              .set({ updatedAt: new Date(), ...(whatsappConnection.assignedUserId ? { assignedTo: whatsappConnection.assignedUserId } : {}) })
              .where(eq(leadsTable.id, lead.id));
            req.log.info({ leadId: lead.id, phone: normalized, matchBy: match.matchBy }, "meta-webhook: existing lead found (dedup)");
          } else {
            [lead] = await db.insert(leadsTable).values({
              tenantId,
              nome: senderName ?? `WhatsApp ${normalized}`,
              telefone: normalized,
              status: "novo",
              source: "whatsapp",
              assignedTo: whatsappConnection.assignedUserId,
              possivelDuplicata: match.similar ? true : false,
              leadSimilarId: match.similar?.id ?? null,
            }).returning();
            req.log.info({ leadId: lead.id, phone: normalized }, "meta-webhook: new lead created");
            await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento", assignedTo: whatsappConnection.assignedUserId });
          }

          await attributeWhatsAppLeadFromCampaignCode(tenantId, lead.id, mensagem);

          // Find or create conversation
          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(and(
              eq(conversationsTable.tenantId, tenantId),
              eq(conversationsTable.leadId, lead.id),
              eq(conversationsTable.channel, "whatsapp"),
              eq(conversationsTable.whatsappConnectionId, whatsappConnection.id)
            ))
            .limit(1);

          if (!conversation) {
            [conversation] = await db.insert(conversationsTable).values({
              tenantId,
              leadId: lead.id,
              channel: "whatsapp",
              status: "open",
              naoLidas: 0,
              assignedTo: whatsappConnection.assignedUserId,
              whatsappConnectionId: whatsappConnection.id,
            }).returning();
          }

          // Insert incoming message
          const [message] = await db.insert(messagesTable).values({
            tenantId,
            conversationId: conversation.id,
            leadId: lead.id,
            direcao: "entrada",
            canal: "whatsapp",
            conteudo: mensagem,
            enviadoPor: "lead",
            tipoConteudo,
            midiaUrl,
            status: "entregue",
          }).returning();

          // Update conversation counters + last inbound timestamp
          await db.update(conversationsTable).set({
            assignedTo: whatsappConnection.assignedUserId,
            naoLidas: sql`${conversationsTable.naoLidas} + 1`,
            ultimaMensagemEm: new Date(),
            lastInboundAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(conversationsTable.id, conversation.id));

          req.log.info({ messageId: message.id, tenantId, phone, tipoConteudo }, "meta-webhook: message processed");

          // Confirmação de agendamento (SIM/NÃO) ou dispatch AI agent
          const _metaApptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);
          if (!_metaApptHandled) {
            dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
          }
        }

        // ── Rastreamento de leitura (read receipts) ──────────────────────
        const statuses = (value.statuses ?? []) as Array<Record<string, unknown>>;
        for (const statusEvt of statuses) {
          if (statusEvt["status"] !== "read") continue;
          const wamidEvt = statusEvt["id"] as string | undefined;
          if (!wamidEvt) continue;

          // Marca abertura em execuções de fluxo de nutrição
          await db
            .update(prospectorFlowExecutionsTable)
            .set({ abertaEm: new Date() })
            .where(
              and(
                eq(prospectorFlowExecutionsTable.wamid, wamidEvt),
                isNull(prospectorFlowExecutionsTable.abertaEm)
              )
            )
            .catch(() => {});

          // Marca leitura em logs de campanha
          await db
            .update(campaignSentLogsTable)
            .set({ readAt: new Date() })
            .where(
              and(
                eq(campaignSentLogsTable.wamid, wamidEvt),
                isNull(campaignSentLogsTable.readAt)
              )
            )
            .catch(() => {});

          req.log.debug({ wamidEvt }, "meta-webhook: read receipt processado");
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "meta-webhook: error processing incoming webhook");
  }
});

// ── Meta Graph API Instagram Webhook ───────────────────────────────────────────
// GET /api/webhooks/meta/instagram — Subscription verification
// POST /api/webhooks/meta/instagram — Receive events

router.get("/webhooks/meta/instagram", async (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe" || !token) {
    req.log.warn({ mode }, "meta/instagram: invalid verification request");
    return res.status(400).json({ error: "Invalid verification request" });
  }

  // Aceita o verify token global do app (env) OU um metaVerifyToken por tenant —
  // consistente com a verificação do webhook do WhatsApp.
  const envToken = process.env["WHATSAPP_VERIFY_TOKEN"];
  let verified = !!envToken && token === envToken;

  if (!verified) {
    const [config] = await db
      .select({ id: agentConfigsTable.id })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.metaVerifyToken, token))
      .limit(1);
    verified = !!config;
  }

  if (!verified) {
    req.log.warn({ mode }, "meta/instagram: verify_token mismatch");
    return res.status(403).json({ error: "Forbidden" });
  }

  req.log.info("meta/instagram: webhook verified");
  return res.status(200).send(challenge);
});

router.post("/webhooks/meta/instagram", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  req.log.info(
    { object: body.object, entries: (body.entry as any[])?.length },
    "meta/instagram: webhook received"
  );

  // Acknowledge immediately (200 OK)
  res.status(200).json({ status: "received" });

  try {
    if (body.object !== "instagram") {
      req.log.warn({ object: body.object }, "meta/instagram: ignoring non-instagram object");
      return;
    }

    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      // Instagram Page ID is entry.id — used to resolve tenant for comment events
      const pageId = String(entry.id ?? "");
      const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
      for (const change of changes) {
        // ── Comment events (change.field === "comments") ──────────────────────
        // Payload: { field: "comments", value: { id, text, from: { id, username }, media: { id }, timestamp } }
        // NOTE: to receive these events, subscribe the "comments" field in the Meta App Dashboard
        // under Instagram → Webhooks → Subscribed Fields.
        if (change.field === "comments") {
          const v = change.value as Record<string, unknown>;
          const from = v["from"] as Record<string, string> | undefined;
          const media = v["media"] as Record<string, string> | undefined;
          const commentText = String(v["text"] ?? "").trim();
          const commentId = String(v["id"] ?? "");
          const commentTimestamp = v["timestamp"]
            ? new Date(Number(v["timestamp"]) * 1000)
            : new Date();
          const igsid = from?.id ?? "";
          const username = from?.username ?? `Instagram @${igsid.slice(0, 8)}`;
          const postId = media?.id ?? "";

          if (!igsid || !commentText) {
            req.log.warn({ commentId }, "meta/instagram/comment: missing igsid or text, skipping");
            continue;
          }

          // Resolve tenant by Instagram Page ID
          let tenantId: string | null = null;
          if (pageId) {
            const [instagramConnection] = await db
              .select({ tenantId: instagramConnectionsTable.tenantId })
              .from(instagramConnectionsTable)
              .where(and(
                eq(instagramConnectionsTable.pageId, pageId),
                isNull(instagramConnectionsTable.disconnectedAt),
              ))
              .limit(1);
            if (instagramConnection) {
              tenantId = instagramConnection.tenantId;

              const [agentCfg] = await db
                .select({ commentKeywords: agentConfigsTable.commentKeywords })
                .from(agentConfigsTable)
                .where(eq(agentConfigsTable.tenantId, tenantId))
                .limit(1);

              // Keyword filter — case-insensitive match against any configured keyword
              const keywords: string[] = Array.isArray(agentCfg?.commentKeywords) && agentCfg.commentKeywords.length > 0
                ? agentCfg.commentKeywords
                : [];

              if (keywords.length > 0) {
                const textUpper = commentText.toUpperCase();
                const matched = keywords.some((kw) => textUpper.includes(kw.toUpperCase()));
                if (!matched) {
                  req.log.info(
                    { commentId, igsid, postId, keywords },
                    "meta/instagram/comment: no keyword match, skipping"
                  );
                  continue;
                }
              }

              req.log.info(
                { commentId, igsid, username, postId, commentText, commentTimestamp, tenantId },
                "meta/instagram/comment: keyword match captured"
              );

              // ── Passo 3: criar lead automaticamente ──────────────────────
              // Dedup: reusa lead existente pelo IGSID (pode ser alguém que
              // já enviou DM antes). Não cria duplicata paralela.
              let lead: typeof leadsTable.$inferSelect | null = null;

              const [existingByIgsid] = await db
                .select()
                .from(leadsTable)
                .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, igsid)))
                .limit(1);

              if (existingByIgsid) {
                lead = existingByIgsid;
                req.log.info(
                  { leadId: lead.id, igsid },
                  "meta/instagram/comment: reusing existing lead (IGSID match)"
                );
              } else {
                // Contexto do comentário gravado em notasNutricao (texto visível
                // no CRM) e em discoveryData (estruturado, para automações futuras)
                const notasNutricao = `Comentou no post Instagram [${postId}]: "${commentText}"`;
                const discoveryData: Record<string, unknown> = {
                  origin: "instagram_comment",
                  commentText,
                  postId,
                  commentId,
                  commentedAt: commentTimestamp.toISOString(),
                };

                const similarCheck = await findLeadByDedup(tenantId, null, null, username);
                const hasSimilar = similarCheck.found === false && similarCheck.similar !== null;
                const similarId = hasSimilar ? (similarCheck.similar?.id ?? null) : null;

                [lead] = await db
                  .insert(leadsTable)
                  .values({
                    tenantId,
                    nome: username,
                    instagramScopedId: igsid,
                    instagramHandle: username,
                    status: "novo",
                    source: "instagram_comment",
                    notasNutricao,
                    discoveryData,
                    possivelDuplicata: hasSimilar,
                    leadSimilarId: similarId,
                  })
                  .returning();

                req.log.info(
                  { leadId: lead.id, igsid, username, source: "instagram_comment" },
                  "meta/instagram/comment: new lead created"
                );

                await db.insert(dealsTable).values({
                  tenantId,
                  leadId: lead.id,
                  titulo: lead.nome,
                  etapa: "em_aquecimento",
                });
              }

              // ── Conversa Instagram (reutiliza se já existir de DMs) ───────
              let [conversation] = await db
                .select()
                .from(conversationsTable)
                .where(
                  and(
                    eq(conversationsTable.tenantId, tenantId),
                    eq(conversationsTable.leadId, lead.id),
                    eq(conversationsTable.channel, "instagram")
                  )
                )
                .limit(1);

              if (!conversation) {
                [conversation] = await db
                  .insert(conversationsTable)
                  .values({
                    tenantId,
                    leadId: lead.id,
                    channel: "instagram",
                    status: "open",
                    naoLidas: 0,
                  })
                  .returning();
                req.log.info(
                  { conversationId: conversation.id },
                  "meta/instagram/comment: new conversation created"
                );
              }

              // ── Registra o comentário como mensagem de entrada ────────────
              const conteudoMsg = `[Comentário no post ${postId}] ${commentText}`;
              const [dbMessage] = await db
                .insert(messagesTable)
                .values({
                  tenantId,
                  conversationId: conversation.id,
                  leadId: lead.id,
                  direcao: "entrada",
                  canal: "instagram",
                  conteudo: conteudoMsg,
                  enviadoPor: "lead",
                  tipoConteudo: "texto",
                  status: "entregue",
                })
                .returning();

              await db
                .update(conversationsTable)
                .set({
                  ultimaMensagemEm: new Date(),
                  naoLidas: sql`${conversationsTable.naoLidas} + 1`,
                  updatedAt: new Date(),
                })
                .where(eq(conversationsTable.id, conversation.id));

              req.log.info(
                { messageId: dbMessage.id, leadId: lead.id, conversationId: conversation.id },
                "meta/instagram/comment: lead created — dispatching SDR"
              );

              // ── Passo 4: aciona SDR automaticamente ──────────────────────
              // Usa forcedAgent: "sdr" — igual ao fluxo do Prospector —
              // garantindo que o SDR assume independentemente do agente padrão
              // do tenant. O conteúdo da mensagem é o próprio comentário.
              dispatchAgentBackground({
                tenantId,
                leadId: lead.id,
                mensagem: commentText,
                log: req.log,
                forcedAgent: "sdr",
              });
            }
          }

          if (!tenantId) {
            req.log.warn({ igsid, pageId }, "meta/instagram/comment: no tenant found for page");
          }
          continue;
        }

        // ── DM events (value.messaging array) ────────────────────────────────
        const value = change.value as Record<string, unknown>;
        const messaging = (value.messaging ?? []) as Array<Record<string, unknown>>;

        for (const msg of messaging) {
          const sender = msg["sender"] as Record<string, string> | undefined;
          const message = msg["message"] as Record<string, unknown> | undefined;
          if (!sender || !message) continue;

          // Ignore echo messages (sent by the bot itself)
          if (message["is_echo"] === true) continue;

          const igsid = sender.id;
          const text = (message["text"] as string) ?? "";
          if (!igsid) continue;

          // Resolve tenant by Instagram Page ID (recipient)
          const recipient = (msg["recipient"] as Record<string, string>)?.id;
          let tenantId: string | null = null;

          if (recipient) {
            const [instagramConnection] = await db
              .select({ tenantId: instagramConnectionsTable.tenantId })
              .from(instagramConnectionsTable)
              .where(and(
                eq(instagramConnectionsTable.pageId, recipient),
                isNull(instagramConnectionsTable.disconnectedAt),
              ))
              .limit(1);
            if (instagramConnection) tenantId = instagramConnection.tenantId;
          }

          if (!tenantId) {
            req.log.warn({ igsid, recipient }, "meta/instagram: no tenant found for page");
            continue;
          }

          // Find or create lead: 1) by IGSID (exact), 2) check for similar name
          let lead: typeof leadsTable.$inferSelect | null = null;

          const [existingByIgsid] = await db
            .select()
            .from(leadsTable)
            .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, igsid)))
            .limit(1);

          if (existingByIgsid) {
            lead = existingByIgsid;
            req.log.info({ leadId: lead.id, igsid }, "meta/instagram: existing lead found by IGSID");
          } else {
            const match = await findLeadByDedup(tenantId, null, null, `Instagram @${igsid.slice(0, 8)}`);
            const hasSimilar = match.found === false && match.similar !== null;
            const similarId = match.found === false ? match.similar?.id ?? null : null;

            [lead] = await db
              .insert(leadsTable)
              .values({
                tenantId,
                nome: `Instagram @${igsid.slice(0, 8)}`,
                instagramScopedId: igsid,
                status: "novo",
                source: "instagram",
                possivelDuplicata: hasSimilar,
                leadSimilarId: similarId,
              })
              .returning();
            req.log.info({ leadId: lead.id, igsid, tenantId, possivelDuplicata: lead.possivelDuplicata }, "meta/instagram: new lead created");
            await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
          }

          // Find or create Instagram conversation
          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(
              and(
                eq(conversationsTable.tenantId, tenantId),
                eq(conversationsTable.leadId, lead.id),
                eq(conversationsTable.channel, "instagram")
              )
            )
            .limit(1);

          if (!conversation) {
            [conversation] = await db
              .insert(conversationsTable)
              .values({
                tenantId,
                leadId: lead.id,
                channel: "instagram",
                status: "open",
                naoLidas: 0,
              })
              .returning();
            req.log.info({ conversationId: conversation.id, tenantId }, "meta/instagram: new conversation created");
          }

          // Insert incoming message
          const [dbMessage] = await db
            .insert(messagesTable)
            .values({
              tenantId,
              conversationId: conversation.id,
              leadId: lead.id,
              direcao: "entrada",
              canal: "instagram",
              conteudo: text,
              enviadoPor: "lead",
              tipoConteudo: "texto",
              status: "entregue",
            })
            .returning();

          // Update conversation counters
          await db
            .update(conversationsTable)
            .set({
              ultimaMensagemEm: new Date(),
              naoLidas: sql`${conversationsTable.naoLidas} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, conversation.id));

          req.log.info({ messageId: dbMessage.id, leadId: lead.id, tenantId }, "meta/instagram: message processed");

          // Dispatch AI agent in background
          dispatchAgentBackground({
            tenantId,
            leadId: lead.id,
            mensagem: text,
            log: req.log,
          });
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "meta/instagram: error processing webhook");
  }
});

export default router;

// ═════════════════════════════════════════════════════════════════════════════
// Meta Graph API Messenger Webhook
// ═════════════════════════════════════════════════════════════════════════════
// GET /api/webhooks/meta/messenger — Subscription verification
// POST /api/webhooks/meta/messenger — Receive incoming messages
//
// Mesma família de API do Instagram/WhatsApp (Meta Graph API), mas payload
// próprio: object="page", entry[].messaging[] com sender.id (PSID) e
// message.text — não usa a estrutura de "comments" do Instagram nem o
// formato de mensagem do WhatsApp Business.

router.get("/webhooks/meta/messenger", async (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe" || !token) {
    req.log.warn({ mode }, "meta/messenger: invalid verification request");
    return res.status(400).json({ error: "Invalid verification request" });
  }

  // Mesmo padrão de verificação já usado pro WhatsApp/Instagram: aceita o
  // verify token global do app (env) OU um metaVerifyToken por tenant.
  const envToken = process.env["WHATSAPP_VERIFY_TOKEN"];
  let verified = !!envToken && token === envToken;

  if (!verified) {
    const [config] = await db
      .select({ id: agentConfigsTable.id })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.metaVerifyToken, token))
      .limit(1);
    verified = !!config;
  }

  if (!verified) {
    req.log.warn({ mode }, "meta/messenger: verify_token mismatch");
    return res.status(403).json({ error: "Forbidden" });
  }

  req.log.info("meta/messenger: webhook verified");
  return res.status(200).send(challenge);
});

router.post("/webhooks/meta/messenger", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  req.log.info(
    { object: body.object, entries: (body.entry as any[])?.length },
    "meta/messenger: webhook received"
  );

  // Acknowledge immediately (200 OK) — mesmo padrão seguro já usado nos
  // outros webhooks Meta: nunca deixa uma falha de processamento virar 500
  // e disparar reenvio (que poderia duplicar lead/mensagem).
  res.status(200).json({ status: "received" });

  try {
    if (body.object !== "page") {
      req.log.warn({ object: body.object }, "meta/messenger: ignoring non-page object");
      return;
    }

    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const pageId = String(entry.id ?? "");
      const messagingEvents = (entry.messaging ?? []) as Array<Record<string, unknown>>;

      for (const event of messagingEvents) {
        const sender = event.sender as Record<string, unknown> | undefined;
        const psid = String(sender?.id ?? "");
        if (!psid) continue;

        const message = event.message as Record<string, unknown> | undefined;

        // Echo da própria página respondendo (via API ou manualmente no
        // Meta Business Suite) — nunca processar como mensagem de entrada.
        if (message?.is_echo) {
          req.log.debug({ psid }, "meta/messenger: discarded — echo message");
          continue;
        }

        // Read receipts, delivery, postbacks etc. sem texto — nada a
        // processar como mensagem de entrada por enquanto.
        const texto = typeof message?.text === "string" ? message.text.trim() : "";
        if (!texto) {
          req.log.debug({ psid }, "meta/messenger: discarded — no text content");
          continue;
        }

        // Resolve tenant a partir do pageId
        const [agentCfg] = await db
          .select({ tenantId: agentConfigsTable.tenantId })
          .from(agentConfigsTable)
          .where(eq(agentConfigsTable.messengerPageId, pageId))
          .limit(1);

        if (!agentCfg) {
          req.log.warn({ pageId }, "meta/messenger: no tenant found for pageId");
          continue;
        }

        const { tenantId } = agentCfg;

        try {
          // Lead: encontra por messengerScopedId (não tem telefone, PSID é
          // o identificador único aqui — diferente do fluxo de WhatsApp).
          let [lead] = await db
            .select()
            .from(leadsTable)
            .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.messengerScopedId, psid)))
            .limit(1);

          if (lead) {
            await db.update(leadsTable).set({ updatedAt: new Date() }).where(eq(leadsTable.id, lead.id));
          } else {
            [lead] = await db
              .insert(leadsTable)
              .values({
                tenantId,
                nome: `Contato Messenger ${psid.slice(-6)}`,
                status: "novo",
                source: "messenger",
                messengerScopedId: psid,
              })
              .returning();
            req.log.info({ leadId: lead.id, psid }, "meta/messenger: new lead created");
            await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
          }

          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(
              and(
                eq(conversationsTable.tenantId, tenantId),
                eq(conversationsTable.leadId, lead.id),
                eq(conversationsTable.channel, "messenger")
              )
            )
            .limit(1);

          if (!conversation) {
            [conversation] = await db
              .insert(conversationsTable)
              .values({ tenantId, leadId: lead.id, channel: "messenger", status: "open", naoLidas: 0 })
              .returning();
          }

          const [insertedMessage] = await db
            .insert(messagesTable)
            .values({
              tenantId,
              conversationId: conversation.id,
              leadId: lead.id,
              direcao: "entrada",
              canal: "messenger",
              conteudo: texto,
              enviadoPor: "lead",
              tipoConteudo: "texto",
              status: "entregue",
            })
            .returning();

          await db
            .update(conversationsTable)
            .set({
              ultimaMensagemEm: new Date(),
              lastInboundAt: new Date(),
              naoLidas: sql`${conversationsTable.naoLidas} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, conversation.id));

          dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem: texto, log: req.log });
          req.log.info({ messageId: insertedMessage.id, leadId: lead.id }, "meta/messenger: agent dispatched");
        } catch (persistErr) {
          // Mesma proteção aplicada hoje no webhook Z-API: falha de
          // persistência não pode propagar (resposta já foi enviada, isso
          // só afeta o log — mas mantém o padrão do resto do arquivo).
          req.log.error({ err: persistErr, tenantId, psid }, "meta/messenger: falha ao persistir lead/conversa/mensagem");
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "meta/messenger: error processing webhook");
  }
});
