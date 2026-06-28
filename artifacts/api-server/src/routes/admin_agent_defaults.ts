import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, agentDefaultsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

const patchSchema = z.object({
  systemPromptBase: z.string().min(1).optional(),
  parametrosBase:   z.record(z.string(), z.unknown()).optional(),
  nome:             z.string().min(1).optional(),
  descricao:        z.string().optional(),
  categoria:        z.string().optional(),
  ativo:            z.boolean().optional(),
});

// ── GET /admin/agent-defaults ─────────────────────────────────────────────────
router.get("/admin/agent-defaults", requireRole("super_admin"), async (_req, res) => {
  const defaults = await db
    .select()
    .from(agentDefaultsTable)
    .orderBy(agentDefaultsTable.agentKey);
  return res.json(defaults);
});

// ── PATCH /admin/agent-defaults/:agentKey ─────────────────────────────────────
router.patch("/admin/agent-defaults/:agentKey", requireRole("super_admin"), async (req, res) => {
  const { agentKey } = req.params as { agentKey: string };

  const [existing] = await db
    .select({ agentKey: agentDefaultsTable.agentKey })
    .from(agentDefaultsTable)
    .where(eq(agentDefaultsTable.agentKey, agentKey));

  if (!existing) {
    res.status(404).json({ error: "Agente não encontrado" });
    return;
  }

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(agentDefaultsTable)
    .set(parsed.data)
    .where(eq(agentDefaultsTable.agentKey, agentKey))
    .returning();

  return res.json(updated);
});

export default router;
