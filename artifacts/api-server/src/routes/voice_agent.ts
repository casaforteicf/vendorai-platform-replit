import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, leadsTable, whatsappConnectionsTable } from "@workspace/db";
import { startVoiceSession, registerVoiceTurn, interruptVoiceSession, endVoiceSession } from "../services/voice-agent-orchestrator.js";
import { createVendorAiVoiceStream, resolveDefaultVendorAiVoice } from "../services/vendorai-voice-engine.js";

const router: IRouter = Router();

function normalizeWhatsAppNumber(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

async function resolveMetaVoiceConnection(tenantId: string) {
  const [connection] = await db
    .select({
      phoneNumberId: whatsappConnectionsTable.phoneNumberId,
      accessToken: whatsappConnectionsTable.accessToken,
    })
    .from(whatsappConnectionsTable)
    .where(and(
      eq(whatsappConnectionsTable.tenantId, tenantId),
      eq(whatsappConnectionsTable.provider, "meta"),
      eq(whatsappConnectionsTable.status, "active"),
    ))
    .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
    .limit(1);

  if (!connection?.phoneNumberId || !connection.accessToken) {
    throw new Error("META_WHATSAPP_CALLING_NOT_CONFIGURED");
  }
  return { phoneNumberId: connection.phoneNumberId, accessToken: connection.accessToken };
}

async function loadVoiceLeadPhone(tenantId: string, leadId: string) {
  const [lead] = await db
    .select({ id: leadsTable.id, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.id, leadId)))
    .limit(1);
  if (!lead) throw new Error("VOICE_LEAD_NOT_FOUND");
  if (!lead.telefone) throw new Error("VOICE_LEAD_PHONE_MISSING");
  return { ...lead, telefone: normalizeWhatsAppNumber(lead.telefone) };
}

async function graphJson(input: {
  method?: "GET" | "POST";
  path: string;
  accessToken: string;
  body?: Record<string, unknown>;
}) {
  const version = process.env["META_GRAPH_API_VERSION"]?.trim() || "v26.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${input.path}`, {
    method: input.method ?? "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload && typeof payload === "object" && "error" in payload)) {
    const error = new Error(`META_CALLING_API_ERROR:${response.status}`);
    (error as Error & { details?: unknown }).details = payload;
    throw error;
  }
  return payload as Record<string, unknown>;
}

async function callWorker(input: { path: string; body?: Record<string, unknown> }) {
  const baseUrl = process.env["VENDORAI_CALL_WORKER_URL"]?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("VENDORAI_CALL_WORKER_URL_NOT_CONFIGURED");
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env["VENDORAI_CALL_WORKER_SECRET"];
  if (secret) headers["x-vendorai-call-worker-secret"] = secret;

  const response = await fetch(`${baseUrl}${input.path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input.body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`VOICE_CALL_WORKER_ERROR:${response.status}`);
  return payload as Record<string, unknown>;
}

async function getCallPermissionState(tenantId: string, leadId: string) {
  const [connection, lead] = await Promise.all([
    resolveMetaVoiceConnection(tenantId),
    loadVoiceLeadPhone(tenantId, leadId),
  ]);
  const payload = await graphJson({
    method: "GET",
    path: `${connection.phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(lead.telefone)}`,
    accessToken: connection.accessToken,
  });
  return { connection, lead, payload };
}

function permissionIsGranted(payload: Record<string, unknown>): boolean {
  const raw = JSON.stringify(payload).toLocaleLowerCase("en-US");
  return (
    raw.includes('"status":"accepted"') ||
    raw.includes('"status":"granted"') ||
    raw.includes('"permission_status":"accepted"') ||
    raw.includes('"permission_status":"granted"') ||
    raw.includes('"call_permission":"accepted"')
  );
}



const tenantGuard = (req: any, res: any): boolean => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant/Super Admin
  const tenantId = String(req.params["tenantId"] ?? "");
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return false;
  }
  return true;
};


const callPermissionSchema = z.object({
  leadId: z.string().min(1),
  message: z.string().trim().min(1).max(1024).optional(),
});

const outboundCallSchema = z.object({
  leadId: z.string().min(1),
});

const startSchema = z.object({
  leadId: z.string().min(1),
  source: z.enum(["whatsapp", "phone", "web"]).default("whatsapp"),
});

const turnSchema = z.object({
  leadId: z.string().min(1),
  sessionId: z.string().min(1),
  transcript: z.string().trim().min(1),
});


const interruptSchema = z.object({
  leadId: z.string().min(1),
  sessionId: z.string().min(1),
});

const speechSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  identityId: z.string().min(1).optional(),
  voiceProfileId: z.string().min(1).optional(),
  language: z.string().trim().min(2).default("pt-br"),
});

const endSchema = z.object({
  leadId: z.string().min(1),
  sessionId: z.string().min(1),
});


router.post("/tenants/:tenantId/voice-agent/call-permission", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = callPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // tenant-audit: reviewed tenantGuard already authorized this route tenant before any tenant-scoped access
  const tenantId = String(req.params["tenantId"]);
  try {
    const [connection, lead] = await Promise.all([
      resolveMetaVoiceConnection(tenantId),
      loadVoiceLeadPhone(tenantId, parsed.data.leadId),
    ]);

    const result = await graphJson({
      path: `${connection.phoneNumberId}/messages`,
      accessToken: connection.accessToken,
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: lead.telefone,
        type: "interactive",
        interactive: {
          type: "call_permission_request",
          body: {
            text: parsed.data.message ?? "Podemos ligar para você pelo WhatsApp para continuar este atendimento?",
          },
          action: { name: "call_permission_request" },
        },
      },
    });

    res.status(202).json({
      requested: true,
      leadId: lead.id,
      provider: "meta",
      result,
    });
  } catch (error) {
    req.log.error({ error, tenantId }, "voice-agent: call permission request failed");
    res.status(422).json({
      error: error instanceof Error ? error.message : "CALL_PERMISSION_REQUEST_FAILED",
      details: error && typeof error === "object" && "details" in error ? (error as any).details : undefined,
    });
  }
});

router.get("/tenants/:tenantId/voice-agent/call-permission/:leadId", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  // tenant-audit: reviewed tenantGuard already authorized this route tenant before any tenant-scoped access
  const tenantId = String(req.params["tenantId"]);
  const leadId = String(req.params["leadId"]);
  try {
    const result = await getCallPermissionState(tenantId, leadId);
    res.json({
      leadId,
      granted: permissionIsGranted(result.payload),
      permission: result.payload,
    });
  } catch (error) {
    req.log.error({ error, tenantId, leadId }, "voice-agent: call permission check failed");
    res.status(422).json({ error: error instanceof Error ? error.message : "CALL_PERMISSION_CHECK_FAILED" });
  }
});

router.post("/tenants/:tenantId/voice-agent/outbound/start", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = outboundCallSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // tenant-audit: reviewed tenantGuard already authorized this route tenant before any tenant-scoped access
  const tenantId = String(req.params["tenantId"]);
  try {
    const permission = await getCallPermissionState(tenantId, parsed.data.leadId);
    if (!permissionIsGranted(permission.payload)) {
      res.status(409).json({
        error: "CALL_PERMISSION_REQUIRED",
        message: "O lead ainda não concedeu permissão de chamada no WhatsApp.",
        permission: permission.payload,
      });
      return;
    }

    const session = await startVoiceSession({
      tenantId,
      leadId: parsed.data.leadId,
      source: "whatsapp",
      log: req.log,
    });
    const callKey = crypto.randomUUID();
    const offer = await callWorker({
      path: "/v1/calls/outbound-offer",
      body: {
        call_key: callKey,
        tenant_id: tenantId,
        lead_id: parsed.data.leadId,
        session_id: session.sessionId,
      },
    });
    const sdp = String(offer["sdp"] ?? "");
    if (!sdp) throw new Error("VOICE_CALL_WORKER_NO_SDP");

    const connect = await graphJson({
      path: `${permission.connection.phoneNumberId}/calls`,
      accessToken: permission.connection.accessToken,
      body: {
        messaging_product: "whatsapp",
        to: permission.lead.telefone,
        action: "connect",
        session: { sdp_type: "offer", sdp },
        biz_opaque_callback_data: `tenant=${tenantId};lead=${parsed.data.leadId};session=${session.sessionId};callKey=${callKey}`.slice(0, 512),
      },
    });

    res.status(201).json({
      started: true,
      callKey,
      sessionId: session.sessionId,
      provider: "meta",
      connect,
    });
  } catch (error) {
    req.log.error({ error, tenantId }, "voice-agent: outbound call start failed");
    res.status(422).json({
      error: error instanceof Error ? error.message : "OUTBOUND_CALL_START_FAILED",
      details: error && typeof error === "object" && "details" in error ? (error as any).details : undefined,
    });
  }
});


router.post("/tenants/:tenantId/voice-agent/session/start", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await startVoiceSession({
      // tenant-audit: reviewed tenantGuard already authorized this route tenant
      tenantId: String(req.params["tenantId"]),
      leadId: parsed.data.leadId,
      source: parsed.data.source,
      log: req.log,
    });
    res.status(201).json(result);
  } catch (error) {
    req.log.error({ error }, "voice-agent: failed to start session");
    res.status(422).json({ error: error instanceof Error ? error.message : "VOICE_SESSION_START_FAILED" });
  }
});

router.post("/tenants/:tenantId/voice-agent/session/turn", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = turnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await registerVoiceTurn({
      // tenant-audit: reviewed tenantGuard already authorized this route tenant
      tenantId: String(req.params["tenantId"]),
      leadId: parsed.data.leadId,
      sessionId: parsed.data.sessionId,
      transcript: parsed.data.transcript,
      log: req.log,
    });
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "voice-agent: failed to register turn");
    res.status(422).json({ error: error instanceof Error ? error.message : "VOICE_TURN_FAILED" });
  }
});


router.post("/tenants/:tenantId/voice-agent/session/interrupt", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = interruptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await interruptVoiceSession({
      // tenant-audit: reviewed tenantGuard already authorized this route tenant
      tenantId: String(req.params["tenantId"]),
      leadId: parsed.data.leadId,
      sessionId: parsed.data.sessionId,
    });
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "voice-agent: failed to interrupt session");
    res.status(422).json({ error: error instanceof Error ? error.message : "VOICE_INTERRUPT_FAILED" });
  }
});

router.post("/tenants/:tenantId/voice-agent/speech/stream", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = speechSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // tenant-audit: reviewed tenantGuard already authorized this route tenant before any tenant-scoped access
  const tenantId = String(req.params["tenantId"]);
  try {
    let identityId = parsed.data.identityId ?? null;
    let voiceProfileId = parsed.data.voiceProfileId ?? null;

    if (!identityId || !voiceProfileId) {
      const defaultVoice = await resolveDefaultVendorAiVoice({
        tenantId,
        language: parsed.data.language,
      });
      identityId = defaultVoice?.identityId ?? null;
      voiceProfileId = defaultVoice?.voiceProfileId ?? null;
    }

    if (!identityId || !voiceProfileId) {
      res.status(422).json({
        error: "Nenhuma voz do Dublê ativa, pronta e autorizada para este tenant",
        code: "DUBLE_VOICE_NOT_CONFIGURED",
      });
      return;
    }

    const stream = await createVendorAiVoiceStream({
      tenantId,
      identityId,
      voiceProfileId,
      text: parsed.data.text,
      language: parsed.data.language,
    });

    res.status(200);
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-vendorai-voice-job-id", stream.jobId);
    res.setHeader("x-vendorai-voice-profile-id", stream.voiceSelection.voiceProfileId);

    const reader = stream.response.body!.getReader();
    req.on("close", () => {
      void reader.cancel("client_disconnected");
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    req.log.error({ error, tenantId }, "voice-agent: speech streaming failed");
    if (!res.headersSent) {
      res.status(422).json({ error: error instanceof Error ? error.message : "VOICE_STREAM_FAILED" });
    } else {
      res.end();
    }
  }
});

router.post("/tenants/:tenantId/voice-agent/session/end", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await endVoiceSession({
      // tenant-audit: reviewed tenantGuard already authorized this route tenant
      tenantId: String(req.params["tenantId"]),
      leadId: parsed.data.leadId,
      sessionId: parsed.data.sessionId,
    });
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "voice-agent: failed to end session");
    res.status(422).json({ error: error instanceof Error ? error.message : "VOICE_SESSION_END_FAILED" });
  }
});

export default router;
