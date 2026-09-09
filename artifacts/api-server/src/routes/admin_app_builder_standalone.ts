import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { appInstancesTable, appTemplateVersionsTable, db, tenantsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireRole("super_admin"));

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use somente letras minúsculas, números e hífen");

const standaloneCreateSchema = z.object({
  ownerType: z.enum(["prospect", "internal"]),
  ownerName: z.string().trim().min(2).max(160),
  ownerEmail: z.string().trim().email().max(320).nullable().optional(),
  ownerCompany: z.string().trim().max(180).nullable().optional(),
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
});

const linkTenantSchema = z.object({ tenantId: z.string().min(1) });

router.get("/admin/app-builder/portfolio", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT a.id,
           a.tenant_id AS "tenantId",
           a.template_id AS "templateId",
           a.template_version_id AS "templateVersionId",
           a.name,
           a.slug,
           a.status,
           a.owner_type AS "ownerType",
           a.owner_name AS "ownerName",
           a.owner_email AS "ownerEmail",
           a.owner_company AS "ownerCompany",
           a.linked_tenant_at AS "linkedTenantAt",
           a.created_at AS "createdAt",
           a.updated_at AS "updatedAt",
           t.name AS "tenantName",
           t.tenant_code AS "tenantCode"
      FROM app_instances a
      LEFT JOIN tenants t ON t.id = a.tenant_id
     ORDER BY a.updated_at DESC
  `);
  res.json(result.rows);
});

router.get("/admin/app-builder/app-targets", async (_req, res) => {
  const tenants = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
    .from(tenantsTable);

  const standalone = await db.execute(sql`
    SELECT id,
           owner_type AS "ownerType",
           owner_name AS "ownerName",
           owner_email AS "ownerEmail",
           owner_company AS "ownerCompany",
           name,
           slug,
           status,
           created_at AS "createdAt"
    FROM app_instances
    WHERE tenant_id IS NULL
    ORDER BY updated_at DESC
  `);

  res.json({ tenants, standalone: standalone.rows });
});

router.post("/admin/app-builder/standalone-apps", async (req, res) => {
  const parsed = standaloneCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const data = parsed.data;
  const [templateVersion] = await db
    .select({
      id: appTemplateVersionsTable.id,
      templateId: appTemplateVersionsTable.templateId,
      status: appTemplateVersionsTable.status,
    })
    .from(appTemplateVersionsTable)
    .where(eq(appTemplateVersionsTable.id, data.templateVersionId));

  if (!templateVersion || templateVersion.templateId !== data.templateId) {
    return res.status(422).json({ error: "A versão informada não pertence ao template" });
  }
  if (templateVersion.status !== "published") {
    return res.status(422).json({ error: "Somente versões publicadas podem originar um app" });
  }

  try {
    const result = await db.execute(sql`
      INSERT INTO app_instances (
        tenant_id, template_id, template_version_id, name, slug, status,
        theme, navigation, settings, white_label,
        owner_type, owner_name, owner_email, owner_company
      ) VALUES (
        NULL, ${data.templateId}, ${data.templateVersionId}, ${data.name}, ${data.slug}, 'draft',
        '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
        ${data.ownerType}, ${data.ownerName}, ${data.ownerEmail ?? null}, ${data.ownerCompany ?? null}
      )
      RETURNING id, tenant_id AS "tenantId", template_id AS "templateId",
                template_version_id AS "templateVersionId", name, slug, status,
                owner_type AS "ownerType", owner_name AS "ownerName",
                owner_email AS "ownerEmail", owner_company AS "ownerCompany",
                created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "23505") {
      return res.status(409).json({ error: "Já existe um app com esse identificador" });
    }
    throw error;
  }
});

router.post("/admin/app-builder/apps/:id/link-tenant", async (req, res) => {
  const parsed = linkTenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const appId = String(req.params.id);
  const tenantId = parsed.data.tenantId;
  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return res.status(422).json({ error: "Tenant inválido" });

  const result = await db.execute(sql`
    UPDATE app_instances
       SET tenant_id = ${tenantId},
           owner_type = 'tenant',
           linked_tenant_at = now(),
           updated_at = now()
     WHERE id = ${appId}
       AND tenant_id IS NULL
    RETURNING id, tenant_id AS "tenantId", name, slug, status,
              owner_type AS "ownerType", owner_name AS "ownerName",
              owner_company AS "ownerCompany", linked_tenant_at AS "linkedTenantAt"
  `);

  if (!result.rows[0]) {
    return res.status(409).json({ error: "App não encontrado ou já vinculado a um tenant" });
  }

  // Snapshots criados enquanto o app era standalone passam a pertencer ao tenant
  // no momento da conversão, preservando todo o histórico do projeto.
  await db.execute(sql`
    UPDATE app_instance_versions
       SET tenant_id = ${tenantId}
     WHERE app_instance_id = ${appId}
       AND tenant_id IS NULL
  `);

  return res.json({ ...result.rows[0], tenantName: tenant.name });
});

export default router;
