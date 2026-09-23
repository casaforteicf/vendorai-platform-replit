import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { buildLeadCaptureToolWithJarvis } from "../services/jarvis-tool-builder.js";

const router: IRouter = Router();

const requestSchema = z.object({
  brief: z.string().trim().min(8).max(6000),
  name: z.string().trim().min(2).max(120).optional(),
  mode: z.enum(["auto", "reuse", "create"]).default("auto"),
  publish: z.boolean().default(true),
  freePolicy: z.object({
    mode: z.enum(["uses", "days", "session", "custom"]).optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
    durationDays: z.coerce.number().int().positive().max(365).optional(),
    note: z.string().trim().max(500).optional(),
  }).optional(),
});

router.post("/jarvis/tool-builder", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  try {
    const result = await buildLeadCaptureToolWithJarvis(tenantId, parsed.data);
    return res.status(result.strategy === "requires_development" ? 202 : 200).json(result);
  } catch (error) {
    req.log?.error({ error, tenantId }, "jarvis/tool-builder: failed");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Falha ao construir ferramenta com JARVIS" });
  }
});

export default router;
