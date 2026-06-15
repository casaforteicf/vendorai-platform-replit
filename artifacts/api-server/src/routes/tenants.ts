import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, insertTenantSchema, updateTenantSchema } from "@workspace/db";
import { requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/tenants", async (req, res) => {
  const tenants = await db.select().from(tenantsTable).orderBy(tenantsTable.createdAt);
  res.json(tenants);
});

router.post("/tenants", requireRole("super_admin"), async (req, res) => {
  const parsed = insertTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  type TipoFechamento = "pedido" | "contrato";
  const insertData = {
    ...parsed.data,
    tipoFechamentoDefault: parsed.data.tipoFechamentoDefault as TipoFechamento | null | undefined,
  };

  try {
    const [tenant] = await db.insert(tenantsTable).values(insertData).returning();
    res.status(201).json(tenant);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:id", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

router.patch("/tenants/:id", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const ADMIN_ONLY_FIELDS = ["analysisStalenessHours", "analysisMessageThreshold", "maxAnalysesPerHour"] as const;
  const hasAdminOnlyField = ADMIN_ONLY_FIELDS.some((f) => f in parsed.data && parsed.data[f] !== undefined);
  if (hasAdminOnlyField && req.user?.platformRole === "member") {
    res.status(403).json({ error: "Only admins can update analysis thresholds" });
    return;
  }

  type TipoFechamento = "pedido" | "contrato";
  const updateData = {
    ...parsed.data,
    tipoFechamentoDefault: parsed.data.tipoFechamentoDefault as TipoFechamento | null | undefined,
    updatedAt: new Date(),
  };

  try {
    const [tenant] = await db
      .update(tenantsTable)
      .set(updateData)
      .where(eq(tenantsTable.id, String(req.params.id)))
      .returning();

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json(tenant);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw err;
  }
});

// ── Integration Settings ──────────────────────────────────────────────────────

router.get("/tenants/:id/integration-settings", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const [tenant] = await db
    .select({
      webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
      apiKeyEstoque: tenantsTable.apiKeyEstoque,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    webhookEstoqueUrl: tenant.webhookEstoqueUrl ?? null,
    apiKeyEstoque: tenant.apiKeyEstoque ?? null,
  });
});

router.patch("/tenants/:id/integration-settings", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const { webhookEstoqueUrl } = req.body as { webhookEstoqueUrl?: string | null };

  const [tenant] = await db
    .update(tenantsTable)
    .set({
      webhookEstoqueUrl: webhookEstoqueUrl !== undefined ? (webhookEstoqueUrl || null) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, String(req.params.id)))
    .returning({
      webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
      apiKeyEstoque: tenantsTable.apiKeyEstoque,
    });

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    webhookEstoqueUrl: tenant.webhookEstoqueUrl ?? null,
    apiKeyEstoque: tenant.apiKeyEstoque ?? null,
  });
});

router.post("/tenants/:id/integration-settings/regenerate-key", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const newKey = `vak_${crypto.randomUUID().replace(/-/g, "")}`;

  const [tenant] = await db
    .update(tenantsTable)
    .set({ apiKeyEstoque: newKey, updatedAt: new Date() })
    .where(eq(tenantsTable.id, String(req.params.id)))
    .returning({
      webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
      apiKeyEstoque: tenantsTable.apiKeyEstoque,
    });

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    webhookEstoqueUrl: tenant.webhookEstoqueUrl ?? null,
    apiKeyEstoque: tenant.apiKeyEstoque ?? null,
  });
});

router.delete("/tenants/:id", requireRole("super_admin"), async (req, res) => {
  const [deleted] = await db
    .delete(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)))
    .returning({ id: tenantsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.status(204).send();
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export default router;
