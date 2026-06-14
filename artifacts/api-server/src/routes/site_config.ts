import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  siteConfigTable,
  insertSiteConfigSchema,
  updateSiteConfigSchema,
  tenantsTable,
  businessProfilesTable,
  produtosCatalogoTable,
} from "@workspace/db";

// ─── Public router (no auth) ─────────────────────────────────────────────────
export const publicSiteRouter: IRouter = Router();

publicSiteRouter.get("/public/:tenantSlug/site", async (req, res) => {
  const { tenantSlug } = req.params;

  const [tenant] = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, tenantSlug));

  if (!tenant) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const [siteConfig] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenant.id));

  if (!siteConfig || !siteConfig.ativo) {
    res.status(404).json({ error: "Site not found or inactive" });
    return;
  }

  const [[businessProfile], produtos] = await Promise.all([
    db
      .select({
        nomeFantasia: businessProfilesTable.nomeFantasia,
        telefone: businessProfilesTable.telefone,
        email: businessProfilesTable.email,
        vertical: businessProfilesTable.vertical,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenant.id)),
    db
      .select({
        id: produtosCatalogoTable.id,
        nome: produtosCatalogoTable.nome,
        descricao: produtosCatalogoTable.descricao,
        precoBase: produtosCatalogoTable.precoBase,
        unidade: produtosCatalogoTable.unidade,
      })
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenant.id),
          eq(produtosCatalogoTable.ativo, true)
        )
      )
      .orderBy(produtosCatalogoTable.nome),
  ]);

  res.json({
    tenant,
    businessProfile: businessProfile ?? null,
    produtos,
    siteConfig,
  });
});

// ─── Authenticated CRUD ───────────────────────────────────────────────────────
const router: IRouter = Router();

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function userTenantId(req: Express.Request): string | undefined {
  return (req as any).user?.tenantId;
}
function canAccessTenant(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || userTenantId(req) === tenantId;
}

function isPgUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === "23505") return true;
  if ("cause" in err) return isPgUniqueViolation((err as { cause: unknown }).cause);
  return false;
}

// POST /site-config
router.post("/site-config", async (req, res) => {
  const parsed = insertSiteConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (!canAccessTenant(req, parsed.data.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const [config] = await db
      .insert(siteConfigTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(config);
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ error: "Site config already exists for this tenant" });
      return;
    }
    throw err;
  }
});

// GET /tenants/:tenantId/site-config
router.get("/tenants/:tenantId/site-config", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [config] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenantId));

  if (!config) {
    res.status(404).json({ error: "Site config not found" });
    return;
  }

  res.json(config);
});

// PATCH /site-config/:id
router.patch("/site-config/:id", async (req, res) => {
  const parsed = updateSiteConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Site config not found" });
    return;
  }

  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [updated] = await db
    .update(siteConfigTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(siteConfigTable.id, existing.id))
    .returning();

  res.json(updated);
});

// DELETE /site-config/:id
router.delete("/site-config/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Site config not found" });
    return;
  }

  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(siteConfigTable).where(eq(siteConfigTable.id, existing.id));
  res.status(204).send();
});

export default router;
