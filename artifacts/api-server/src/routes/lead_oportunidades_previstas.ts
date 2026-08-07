import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, leadOportunidadesPrevistasTable, leadsTable } from "@workspace/db";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

async function canAccessLead(req: Express.Request, leadId: string): Promise<string | null> {
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) return null;
  if (isSuperAdmin(req) || tid(req) === lead.tenantId) return lead.tenantId;
  return null;
}

router.get("/leads/:leadId/oportunidades-previstas", async (req, res) => {
  const leadId = req.params.leadId as string;
  const tenantId = await canAccessLead(req, leadId);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(leadOportunidadesPrevistasTable)
    .where(eq(leadOportunidadesPrevistasTable.leadId, leadId))
    .orderBy(desc(leadOportunidadesPrevistasTable.createdAt));
  return res.json(rows);
});

router.post("/leads/:leadId/oportunidades-previstas", async (req, res) => {
  const leadId = req.params.leadId as string;
  const tenantId = await canAccessLead(req, leadId);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  const { descricao, valorEstimado, previsaoData } = req.body as { descricao?: string; valorEstimado?: number; previsaoData?: string };
  if (!descricao?.trim()) return res.status(422).json({ error: "descricao e obrigatoria" });

  const [row] = await db.insert(leadOportunidadesPrevistasTable).values({
    tenantId,
    leadId,
    descricao: descricao.trim(),
    valorEstimado: valorEstimado != null ? String(valorEstimado) : undefined,
    previsaoData: previsaoData ? new Date(previsaoData) : undefined,
    criadoPor: (req as any).user?.id ?? null,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/oportunidades-previstas/:id", async (req, res) => {
  const [existing] = await db.select().from(leadOportunidadesPrevistasTable).where(eq(leadOportunidadesPrevistasTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!isSuperAdmin(req) && tid(req) !== existing.tenantId) return res.status(403).json({ error: "Forbidden" });

  const { descricao, valorEstimado, previsaoData, status } = req.body as { descricao?: string; valorEstimado?: number; previsaoData?: string; status?: string };
  const [row] = await db.update(leadOportunidadesPrevistasTable).set({
    ...(descricao !== undefined ? { descricao } : {}),
    ...(valorEstimado !== undefined ? { valorEstimado: valorEstimado != null ? String(valorEstimado) : null } : {}),
    ...(previsaoData !== undefined ? { previsaoData: previsaoData ? new Date(previsaoData) : null } : {}),
    ...(status !== undefined ? { status } : {}),
    updatedAt: new Date(),
  }).where(eq(leadOportunidadesPrevistasTable.id, req.params.id as string)).returning();
  return res.json(row);
});

router.delete("/oportunidades-previstas/:id", async (req, res) => {
  const [existing] = await db.select().from(leadOportunidadesPrevistasTable).where(eq(leadOportunidadesPrevistasTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!isSuperAdmin(req) && tid(req) !== existing.tenantId) return res.status(403).json({ error: "Forbidden" });

  await db.delete(leadOportunidadesPrevistasTable).where(eq(leadOportunidadesPrevistasTable.id, req.params.id as string));
  return res.status(204).send();
});

export default router;
