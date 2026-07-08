import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  db,
  bloqueiosAgendaTable,
  insertBloqueioAgendaSchema,
} from "@workspace/db";

const router: IRouter = Router();

// GET /tenants/:tenantId/bloqueios-agenda — list agenda blocks.
// Query: responsavelId?, from?, to? (ISO dates)
router.get("/tenants/:tenantId/bloqueios-agenda", async (req, res) => {
  const { responsavelId, from, to } = req.query as Record<string, string | undefined>;

  const conditions = [eq(bloqueiosAgendaTable.tenantId, String(req.params.tenantId))];
  if (responsavelId) conditions.push(eq(bloqueiosAgendaTable.responsavelId, responsavelId));
  if (from) conditions.push(gte(bloqueiosAgendaTable.dataFim, new Date(from)));
  if (to) conditions.push(lte(bloqueiosAgendaTable.dataInicio, new Date(to)));

  const bloqueios = await db
    .select()
    .from(bloqueiosAgendaTable)
    .where(and(...conditions))
    .orderBy(bloqueiosAgendaTable.dataInicio);

  res.json(bloqueios);
});

router.post("/tenants/:tenantId/bloqueios-agenda", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const parsed = insertBloqueioAgendaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (parsed.data.dataFim < parsed.data.dataInicio) {
    res.status(422).json({ error: "dataFim must be on/after dataInicio" });
    return;
  }

  const [bloqueio] = await db
    .insert(bloqueiosAgendaTable)
    .values({ ...parsed.data, criadoPor: parsed.data.criadoPor ?? req.user?.sub ?? null })
    .returning();

  res.status(201).json(bloqueio);
});

router.delete("/bloqueios-agenda/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(bloqueiosAgendaTable)
    .where(eq(bloqueiosAgendaTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Bloqueio not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(bloqueiosAgendaTable).where(eq(bloqueiosAgendaTable.id, existing.id));
  res.status(204).send();
});

export default router;
