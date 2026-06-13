import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  businessProfilesTable,
  insertBusinessProfileSchema,
  updateBusinessProfileSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/business-profiles", async (req, res) => {
  const parsed = insertBusinessProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const [profile] = await db
      .insert(businessProfilesTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(profile);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Tenant already has a business profile" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/business-profile", async (req, res) => {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, String(req.params.tenantId)));

  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  res.json(profile);
});

router.get("/business-profiles/:id", async (req, res) => {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, String(req.params.id)));

  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  res.json(profile);
});

router.patch("/business-profiles/:id", async (req, res) => {
  const parsed = updateBusinessProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: businessProfilesTable.id, tenantId: businessProfilesTable.tenantId })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db
    .update(businessProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(businessProfilesTable.id, existing.id))
    .returning();

  res.json(profile);
});

router.delete("/business-profiles/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: businessProfilesTable.id, tenantId: businessProfilesTable.tenantId })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(businessProfilesTable).where(eq(businessProfilesTable.id, existing.id));

  res.status(204).send();
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}

export default router;
