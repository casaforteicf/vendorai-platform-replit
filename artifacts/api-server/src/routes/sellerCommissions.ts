import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, sellerCommissionsTable, usersTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

// ── GET /tenants/:tenantId/seller-commissions ─────────────────────────────────
// Vendedor vê as próprias; admin vê todas do tenant
router.get("/tenants/:tenantId/seller-commissions", authenticate, async (req, res) => {
  const { tenantId } = req.params;
  const user = req.user!;

  if (user.tenantId !== tenantId && user.platformRole !== "super_admin") {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const isAdmin = user.platformRole === "super_admin" || user.platformRole === "tenant_admin";
  const sellerFilter = isAdmin ? undefined : eq(sellerCommissionsTable.sellerUserId, user.sub);

  const rows = await db
    .select({
      id: sellerCommissionsTable.id,
      sellerUserId: sellerCommissionsTable.sellerUserId,
      clienteTenantId: sellerCommissionsTable.clienteTenantId,
      dealId: sellerCommissionsTable.dealId,
      planSlug: sellerCommissionsTable.planSlug,
      clienteNome: sellerCommissionsTable.clienteNome,
      valorImplantacaoCents: sellerCommissionsTable.valorImplantacaoCents,
      percentual: sellerCommissionsTable.percentual,
      valorComissaoCents: sellerCommissionsTable.valorComissaoCents,
      status: sellerCommissionsTable.status,
      observacoes: sellerCommissionsTable.observacoes,
      paidAt: sellerCommissionsTable.paidAt,
      paidByUserId: sellerCommissionsTable.paidByUserId,
      createdAt: sellerCommissionsTable.createdAt,
      sellerName: usersTable.name,
      sellerEmail: usersTable.email,
    })
    .from(sellerCommissionsTable)
    .leftJoin(usersTable, eq(usersTable.id, sellerCommissionsTable.sellerUserId))
    .where(and(eq(sellerCommissionsTable.tenantId, tenantId), sellerFilter))
    .orderBy(desc(sellerCommissionsTable.createdAt));

  return res.json(rows);
});

// ── GET /tenants/:tenantId/seller-commissions/summary ────────────────────────
router.get("/tenants/:tenantId/seller-commissions/summary", authenticate, async (req, res) => {
  const { tenantId } = req.params;
  const user = req.user!;

  if (user.tenantId !== tenantId && user.platformRole !== "super_admin") {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const isAdmin = user.platformRole === "super_admin" || user.platformRole === "tenant_admin";
  const sellerFilter = isAdmin ? undefined : eq(sellerCommissionsTable.sellerUserId, user.sub);

  const [summary] = await db
    .select({
      totalPendente: sql<number>`COALESCE(SUM(CASE WHEN ${sellerCommissionsTable.status} = 'pendente' THEN ${sellerCommissionsTable.valorComissaoCents} ELSE 0 END), 0)`,
      totalAprovado: sql<number>`COALESCE(SUM(CASE WHEN ${sellerCommissionsTable.status} = 'aprovado' THEN ${sellerCommissionsTable.valorComissaoCents} ELSE 0 END), 0)`,
      totalPago: sql<number>`COALESCE(SUM(CASE WHEN ${sellerCommissionsTable.status} = 'pago' THEN ${sellerCommissionsTable.valorComissaoCents} ELSE 0 END), 0)`,
      totalGeral: sql<number>`COALESCE(SUM(${sellerCommissionsTable.valorComissaoCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(sellerCommissionsTable)
    .where(and(eq(sellerCommissionsTable.tenantId, tenantId), sellerFilter));

  return res.json(summary ?? { totalPendente: 0, totalAprovado: 0, totalPago: 0, totalGeral: 0, count: 0 });
});

// ── PATCH /tenants/:tenantId/seller-commissions/:id ──────────────────────────
// Apenas admins podem alterar status/observações
router.patch("/tenants/:tenantId/seller-commissions/:id", authenticate, async (req, res) => {
  const { tenantId, id } = req.params;
  const user = req.user!;

  const isAdmin = user.platformRole === "super_admin" || user.platformRole === "tenant_admin";
  if (!isAdmin) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Apenas administradores podem atualizar comissões." });
  }
  if (user.tenantId !== tenantId && user.platformRole !== "super_admin") {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const { status, observacoes } = req.body as { status?: string; observacoes?: string };
  const allowedStatuses = ["pendente", "aprovado", "pago", "cancelado"];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "STATUS_INVALIDO", message: `Status deve ser: ${allowedStatuses.join(", ")}` });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) {
    updates.status = status;
    if (status === "pago") {
      updates.paidAt = new Date();
      updates.paidByUserId = user.sub;
    }
  }
  if (observacoes !== undefined) updates.observacoes = observacoes;

  const [updated] = await db
    .update(sellerCommissionsTable)
    .set(updates)
    .where(and(eq(sellerCommissionsTable.id, id), eq(sellerCommissionsTable.tenantId, tenantId)))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  return res.json(updated);
});

export default router;
