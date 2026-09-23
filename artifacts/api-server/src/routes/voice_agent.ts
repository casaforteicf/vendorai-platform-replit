import { Router, type IRouter } from "express";
import { z } from "zod";
import { startVoiceSession, registerVoiceTurn, interruptVoiceSession, endVoiceSession } from "../services/voice-agent-orchestrator.js";
import { createVendorAiVoiceStream, resolveDefaultVendorAiVoice } from "../services/vendorai-voice-engine.js";

const router: IRouter = Router();

const tenantGuard = (req: any, res: any): boolean => {
  const tenantId = String(req.params["tenantId"] ?? "");
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return false;
  }
  return true;
};

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

router.post("/tenants/:tenantId/voice-agent/session/start", async (req, res) => {
  if (!tenantGuard(req, res)) return;
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await startVoiceSession({
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
