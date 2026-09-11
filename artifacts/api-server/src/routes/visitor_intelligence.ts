import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { getVisitorIntelligence } from "../services/visitorIntelligence.js";

const router: IRouter = Router();

const querySchema = z.object({
  minutes: z.coerce.number().int().min(5).max(1440).optional(),
  onlineWindowSeconds: z.coerce.number().int().min(30).max(300).optional(),
});

router.get("/visitor-intelligence", async (req, res) => {
  const tenantId = (req as typeof req & { user?: { tenantId?: string } }).user?.tenantId;
  if (!tenantId) {
    return res.status(401).json({ error: "Tenant não identificado." });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Filtros inválidos.", details: parsed.error.issues });
  }

  try {
    const result = await getVisitorIntelligence(tenantId, parsed.data);
    return res.json(result);
  } catch (error) {
    req.log?.error?.({ error, tenantId }, "visitor-intelligence: failed");
    return res.status(500).json({ error: "Não foi possível carregar Visitor Intelligence." });
  }
});

export default router;
