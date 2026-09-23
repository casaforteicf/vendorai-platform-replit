import { Router, type IRouter } from "express";
import { z } from "zod";
import { startVoiceSession, registerVoiceTurn, endVoiceSession } from "../services/voice-agent-orchestrator.js";

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
