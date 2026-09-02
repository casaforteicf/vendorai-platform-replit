import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  businessProfilesTable,
  tenantsTable,
  whatsappConnectionsTable,
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
    if (parsed.data.vertical) {
      await db
        .update(tenantsTable)
        .set({ vertical: parsed.data.vertical, segmento: parsed.data.vertical, updatedAt: new Date() })
        .where(eq(tenantsTable.id, parsed.data.tenantId));
    }
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
  const tenantId = String(req.params.tenantId);
  const [profileResult, tenantResult, whatsappResult] = await Promise.allSettled([
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      nomeEmpresa: tenantsTable.nomeEmpresa,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
      logoUrl: tenantsTable.logoUrl,
      site: tenantsTable.site,
      descricao: tenantsTable.descricao,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({
      displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber,
      businessName: whatsappConnectionsTable.businessName,
      isDefault: whatsappConnectionsTable.isDefault,
      updatedAt: whatsappConnectionsTable.updatedAt,
    }).from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")))
      .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
      .limit(1),
  ]);
  const profile = profileResult.status === "fulfilled" ? profileResult.value[0] ?? null : null;
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value[0] ?? null : null;
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value[0] ?? null : null;
  const mergedProfile = tenant || profile || whatsapp ? {
    ...(profile ?? {}),
    tenantId,
    razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || "",
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    logoUrl: profile?.logoUrl || tenant?.logoUrl || null,
    telefone: profile?.telefone || whatsapp?.displayPhoneNumber || null,
    descricao: tenant?.descricao || null,
    site: tenant?.site || null,
    displayPhoneNumber: whatsapp?.displayPhoneNumber || null,
  } : null;
  const degraded = [profileResult, tenantResult, whatsappResult].some((result) => result.status === "rejected");
  if (degraded) req.log?.warn({ tenantId }, "business-profile: served with fallback sources");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(mergedProfile);
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

  // A navegação e os gates dos módulos especializados consultam a vertical
  // do tenant. Mantém esse valor alinhado ao perfil comercial editável para
  // que a troca de segmento passe a valer imediatamente em toda a aplicação.
  if (parsed.data.vertical !== undefined) {
    await db
      .update(tenantsTable)
      .set({
        vertical: parsed.data.vertical || null,
        segmento: parsed.data.vertical || null,
        updatedAt: new Date(),
      })
      .where(eq(tenantsTable.id, existing.tenantId));
  }

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
