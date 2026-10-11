import { Router, type IRouter } from "express";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { contractsTable, db, dealsTable } from "@workspace/db";
import financeProcurementRouter from "./finance_procurement.js";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  return (req as any).user?.platformRole === "super_admin" || (req as any).user?.tenantId === tenantId;
}

function pct(part: number, total: number) {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function daysUntil(date: Date | null) {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function contractHealth(contract: {
  status: string;
  expiresAt: Date | null;
  renewalType: string | null;
  renewalNoticeDays: number | null;
  nextAdjustmentAt: Date | null;
  pdfUrl: string | null;
  signedAt: Date | null;
  probChurn: number | null;
}) {
  let score = 100;
  const remaining = daysUntil(contract.expiresAt);
  if (!contract.expiresAt) score -= 18;
  if (!contract.renewalType || contract.renewalType === "none") score -= 10;
  if (!contract.renewalNoticeDays) score -= 5;
  if (!contract.pdfUrl) score -= 8;
  if (!contract.signedAt && contract.status !== "pending_signature") score -= 8;
  if (remaining !== null && remaining < 0) score -= 35;
  else if (remaining !== null && remaining <= 15) score -= 20;
  else if (remaining !== null && remaining <= 30) score -= 10;
  if (contract.nextAdjustmentAt && contract.nextAdjustmentAt.getTime() < Date.now()) score -= 8;
  score -= Math.round(Math.max(0, Math.min(100, contract.probChurn ?? 0)) * 0.2);
  return Math.max(0, Math.min(100, score));
}

router.get("/tenants/:tenantId/finance-contracts", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });

  const rows = await db
    .select({
      id: contractsTable.id,
      dealId: contractsTable.dealId,
      contractType: contractsTable.contractType,
      status: contractsTable.status,
      pdfUrl: contractsTable.pdfUrl,
      sentAt: contractsTable.sentAt,
      signedAt: contractsTable.signedAt,
      effectiveAt: contractsTable.effectiveAt,
      expiresAt: contractsTable.expiresAt,
      renewalType: contractsTable.renewalType,
      renewalNoticeDays: contractsTable.renewalNoticeDays,
      nextAdjustmentAt: contractsTable.nextAdjustmentAt,
      adjustmentIndex: contractsTable.adjustmentIndex,
      obligations: contractsTable.obligations,
      riskClauses: contractsTable.riskClauses,
      updatedAt: contractsTable.updatedAt,
      dealTitle: dealsTable.titulo,
      plan: dealsTable.planoContratado,
      renewalDate: dealsTable.dataRenovacao,
      probChurn: dealsTable.probChurn,
    })
    .from(contractsTable)
    .leftJoin(dealsTable, and(eq(dealsTable.id, contractsTable.dealId), eq(dealsTable.tenantId, tenantId)))
    .where(and(eq(contractsTable.tenantId, tenantId), ne(contractsTable.status, "cancelled")))
    .orderBy(desc(contractsTable.updatedAt))
    .limit(500);

  const contracts = rows.map((row) => {
    const healthPercent = contractHealth(row);
    const daysToExpiry = daysUntil(row.expiresAt);
    const renewalWindowDays = Math.max(0, row.renewalNoticeDays ?? 30);
    const renewalDue = daysToExpiry !== null && row.renewalType && row.renewalType !== "none" && daysToExpiry <= renewalWindowDays;
    const atRisk = healthPercent < 70 || (row.probChurn ?? 0) >= 40 || (daysToExpiry !== null && daysToExpiry < 0);
    return { ...row, healthPercent, daysToExpiry, renewalDue, atRisk };
  });

  const total = contracts.length;
  const active = contracts.filter((item) => item.status === "signed" || Boolean(item.signedAt));
  const lifecycleReady = contracts.filter((item) => item.expiresAt && item.renewalType);
  const automatic = contracts.filter((item) => item.renewalType === "automatic");
  const atRisk = contracts.filter((item) => item.atRisk);
  const renewalDue = contracts.filter((item) => item.renewalDue);

  res.json({
    contracts,
    summary: {
      activePercent: pct(active.length, total),
      lifecycleCoveragePercent: pct(lifecycleReady.length, total),
      automaticRenewalPercent: pct(automatic.length, total),
      atRiskPercent: pct(atRisk.length, total),
      renewalDuePercent: pct(renewalDue.length, total),
      averageHealthPercent: total ? Number((contracts.reduce((sum, item) => sum + item.healthPercent, 0) / total).toFixed(1)) : 100,
    },
  });
});

const lifecycleBody = z.object({
  effectiveAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  renewalType: z.enum(["none", "manual", "automatic"]).nullable().optional(),
  renewalNoticeDays: z.number().int().min(0).max(365).nullable().optional(),
  nextAdjustmentAt: z.string().datetime().nullable().optional(),
  adjustmentIndex: z.string().max(80).nullable().optional(),
  status: z.string().min(2).max(60).optional(),
});

router.put("/tenants/:tenantId/finance-contracts/:contractId/lifecycle", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const parsed = lifecycleBody.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Dados de ciclo de vida inválidos", issues: parsed.error.issues });

  const [existing] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, String(req.params.contractId)), eq(contractsTable.tenantId, tenantId))).limit(1);
  if (!existing) return void res.status(404).json({ error: "Contrato não encontrado" });

  const data = parsed.data;
  const [updated] = await db.update(contractsTable).set({
    ...(data.effectiveAt !== undefined ? { effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : null } : {}),
    ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
    ...(data.renewalType !== undefined ? { renewalType: data.renewalType } : {}),
    ...(data.renewalNoticeDays !== undefined ? { renewalNoticeDays: data.renewalNoticeDays } : {}),
    ...(data.nextAdjustmentAt !== undefined ? { nextAdjustmentAt: data.nextAdjustmentAt ? new Date(data.nextAdjustmentAt) : null } : {}),
    ...(data.adjustmentIndex !== undefined ? { adjustmentIndex: data.adjustmentIndex } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    updatedAt: new Date(),
  }).where(and(eq(contractsTable.id, existing.id), eq(contractsTable.tenantId, tenantId))).returning();

  req.log.info({ tenantId, contractId: existing.id, changedFields: Object.keys(data) }, "finance-contract lifecycle updated");
  res.json(updated);
});

const renewBody = z.object({ months: z.number().int().min(1).max(60).default(12) });

router.post("/tenants/:tenantId/finance-contracts/:contractId/renew", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const parsed = renewBody.safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(422).json({ error: "Período de renovação inválido" });

  const [existing] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, String(req.params.contractId)), eq(contractsTable.tenantId, tenantId))).limit(1);
  if (!existing) return void res.status(404).json({ error: "Contrato não encontrado" });
  if (!existing.expiresAt) return void res.status(409).json({ error: "Defina o vencimento antes de renovar" });
  if (!existing.renewalType || existing.renewalType === "none") return void res.status(409).json({ error: "Contrato não possui regra de renovação ativa" });

  const effectiveAt = new Date(existing.expiresAt);
  effectiveAt.setSeconds(effectiveAt.getSeconds() + 1);
  const expiresAt = new Date(effectiveAt);
  expiresAt.setMonth(expiresAt.getMonth() + parsed.data.months);

  const renewal = await db.transaction(async (tx) => {
    if (existing.dealId) {
      // Serialize renewal creation with the archived_at update on the deal.
      const locked = await tx.execute(sql`
        SELECT id FROM public.deals
        WHERE id = ${existing.dealId} AND tenant_id = ${tenantId}
          AND archived_at IS NULL
        FOR UPDATE
      `);
      if (!locked.rows.length) return null;
    }
    const [created] = await tx.insert(contractsTable).values({
      tenantId,
      dealId: existing.dealId,
      contractType: existing.contractType,
      status: "renewal_pending",
      effectiveAt,
      expiresAt,
      renewalType: existing.renewalType,
      renewalNoticeDays: existing.renewalNoticeDays,
      adjustmentIndex: existing.adjustmentIndex,
      obligations: [{ title: `Renovação originada do contrato ${existing.id}`, status: "pending", notes: `Período renovado por ${parsed.data.months} mês(es).` }],
      riskClauses: existing.riskClauses ?? [],
    }).returning();
    return created;
  });
  if (!renewal) return void res.status(409).json({ code: "DEAL_ARCHIVED", error: "Negócio arquivado ou inexistente impede renovação vinculada." });

  req.log.info({ tenantId, sourceContractId: existing.id, renewalContractId: renewal?.id, months: parsed.data.months }, "finance-contract renewal created");
  res.status(201).json({ renewal, sourceContractId: existing.id });
});

router.use(financeProcurementRouter);

export default router;
