import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, relatosTecnicosTable, tenantsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// GET /admin/relatos-tecnicos — list with optional status filter (super_admin only)
router.get("/admin/relatos-tecnicos", requireRole("super_admin"), async (req, res) => {
  const { status } = req.query;

  const conditions = [];
  if (status && status !== "all") {
    conditions.push(eq(relatosTecnicosTable.status, status as string));
  }

  const rows = await db
    .select({
      id: relatosTecnicosTable.id,
      tenantId: relatosTecnicosTable.tenantId,
      tenantName: tenantsTable.name,
      leadId: relatosTecnicosTable.leadId,
      conversationId: relatosTecnicosTable.conversationId,
      descricaoProblema: relatosTecnicosTable.descricaoProblema,
      transcriptRelevante: relatosTecnicosTable.transcriptRelevante,
      status: relatosTecnicosTable.status,
      criadoEm: relatosTecnicosTable.criadoEm,
    })
    .from(relatosTecnicosTable)
    .leftJoin(tenantsTable, eq(relatosTecnicosTable.tenantId, tenantsTable.id))
    .where(conditions.length > 0 ? and(...(conditions as Parameters<typeof and>)) : undefined)
    .orderBy(desc(relatosTecnicosTable.criadoEm));

  return res.json(rows);
});

// GET /admin/relatos-tecnicos/pending-count — badge counter
router.get("/admin/relatos-tecnicos/pending-count", requireRole("super_admin"), async (_req, res) => {
  const rows = await db
    .select({ id: relatosTecnicosTable.id })
    .from(relatosTecnicosTable)
    .where(eq(relatosTecnicosTable.status, "pendente_revisao"));

  return res.json({ count: rows.length });
});

// PATCH /admin/relatos-tecnicos/:id — update status
const patchSchema = z.object({
  status: z.enum(["confirmado_bug", "nao_e_bug", "encaminhado"]),
});

router.patch("/admin/relatos-tecnicos/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: relatosTecnicosTable.id })
    .from(relatosTecnicosTable)
    .where(eq(relatosTecnicosTable.id, req.params.id!))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Relato not found" });
    return;
  }

  const [updated] = await db
    .update(relatosTecnicosTable)
    .set({ status: parsed.data.status })
    .where(eq(relatosTecnicosTable.id, req.params.id!))
    .returning();

  logger.info({ relatoId: req.params.id, status: parsed.data.status }, "admin: relato_tecnico status updated");

  return res.json(updated);
});

export default router;
