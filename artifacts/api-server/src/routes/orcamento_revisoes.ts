import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  orcamentoRevisoesTable,
  insertOrcamentoRevisaoSchema,
  updateOrcamentoRevisaoSchema,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function hasAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

// ─── List revision history for a lead ──────────────────────────────────────
router.get("/tenants/:tenantId/leads/:leadId/orcamento-revisoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const rows = await db
    .select()
    .from(orcamentoRevisoesTable)
    .where(and(eq(orcamentoRevisoesTable.tenantId, tenantId), eq(orcamentoRevisoesTable.leadId, leadId)))
    .orderBy(desc(orcamentoRevisoesTable.dataOrcamento), desc(orcamentoRevisoesTable.createdAt));

  return res.json(rows);
});

// ─── Create a revision entry ────────────────────────────────────────────────
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const bodySchema = insertOrcamentoRevisaoSchema
    .omit({ tenantId: true, leadId: true, createdBy: true })
    .extend({ dealId: z.string().optional().nullable() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [created] = await db
    .insert(orcamentoRevisoesTable)
    .values({
      ...parsed.data,
      tenantId,
      leadId,
      createdBy: req.user?.id,
    })
    .returning();

  return res.status(201).json(created);
});

// ─── Update a revision entry ────────────────────────────────────────────────
router.patch("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const parsed = updateOrcamentoRevisaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [updated] = await db
    .update(orcamentoRevisoesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(orcamentoRevisoesTable.id, String(req.params.id)),
        eq(orcamentoRevisoesTable.tenantId, tenantId),
        eq(orcamentoRevisoesTable.leadId, leadId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Revisão não encontrada." });
  return res.json(updated);
});

// ─── Delete a revision entry ────────────────────────────────────────────────
router.delete("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const [row] = await db
    .select()
    .from(orcamentoRevisoesTable)
    .where(
      and(
        eq(orcamentoRevisoesTable.id, String(req.params.id)),
        eq(orcamentoRevisoesTable.tenantId, tenantId),
        eq(orcamentoRevisoesTable.leadId, leadId),
      ),
    );
  if (!row) return res.status(404).json({ error: "Revisão não encontrada." });

  await db.delete(orcamentoRevisoesTable).where(eq(orcamentoRevisoesTable.id, row.id));
  return res.json({ success: true });
});

export default router;
