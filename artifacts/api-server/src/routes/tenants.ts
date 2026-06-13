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

  try {
    const [tenant] = await db.insert(tenantsTable).values(parsed.data).returning();
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

  const ADMIN_ONLY_FIELDS = ["analysisStalenessHours", "analysisMessageThreshold"] as const;
  const hasAdminOnlyField = ADMIN_ONLY_FIELDS.some((f) => f in parsed.data && parsed.data[f] !== undefined);
  if (hasAdminOnlyField && req.user?.platformRole === "member") {
    res.status(403).json({ error: "Only admins can update analysis thresholds" });
    return;
  }

  try {
    const [tenant] = await db
      .update(tenantsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
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
