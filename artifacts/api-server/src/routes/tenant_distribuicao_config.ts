import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantDistribuicaoConfigTable, updateTenantDistribuicaoConfigSchema } from "@workspace/db";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed route tenant is consumed only by handlers/middleware that enforce same-tenant or super-admin access before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

const CRITERIOS_PADRAO = ["segmento", "territorio"] as const;

function canManage(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/distribuicao-config", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canManage(req, tenantId)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const [config] = await db
    .select({ criterios: tenantDistribuicaoConfigTable.criterios })
    .from(tenantDistribuicaoConfigTable)
    .where(eq(tenantDistribuicaoConfigTable.tenantId, tenantId))
    .limit(1);

  // Sem linha cadastrada = ordem padrão (mesmo default aplicado no motor de
  // distribuição em pickNextVendedor) — nunca 404 aqui, pra frontend sempre
  // ter algo pra mostrar sem tratar caso especial de "tenant nunca configurou".
  return res.json({ tenantId, criterios: config?.criterios ?? [...CRITERIOS_PADRAO] });
});

router.put("/tenants/:tenantId/distribuicao-config", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") {
    return res.status(403).json({ error: "Só o admin do tenant pode alterar a ordem de distribuição" });
  }
  if (!canManage(req, tenantId)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const parsed = updateTenantDistribuicaoConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }
  const criterios = parsed.data.criterios;
  if (!criterios || !criterios.length) {
    return res.status(422).json({ error: "Envie ao menos um critério (segmento e/ou território)" });
  }

  const [existing] = await db
    .select({ tenantId: tenantDistribuicaoConfigTable.tenantId })
    .from(tenantDistribuicaoConfigTable)
    .where(eq(tenantDistribuicaoConfigTable.tenantId, tenantId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(tenantDistribuicaoConfigTable)
      .values({ tenantId, criterios })
      .returning();
    return res.status(201).json(created);
  }

  const [updated] = await db
    .update(tenantDistribuicaoConfigTable)
    .set({ criterios, updatedAt: new Date() })
    .where(eq(tenantDistribuicaoConfigTable.tenantId, tenantId))
    .returning();

  return res.json(updated);
});

export default router;
