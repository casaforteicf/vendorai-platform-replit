import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  appActionRegistryTable,
  appAiPoliciesTable,
  appComponentRegistryTable,
  appFeatureRegistryTable,
  appInstancesTable,
  appInstanceVersionsTable,
  appTemplateVersionsTable,
  appTemplatesTable,
  appVerticalsTable,
  appWorkflowRegistryTable,
  db,
} from "@workspace/db";

const router: IRouter = Router();

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requireTenantContext(req: Request, res: Response): string | null {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(403).json({
      error: "TENANT_CONTEXT_REQUIRED",
      message: "O runtime de apps exige um contexto de tenant autenticado.",
    });
    return null;
  }
  return tenantId;
}

function privateRuntimeResponse(res: Response) {
  res.set("Cache-Control", "private, no-store");
}

/**
 * Runtime universal do App Builder.
 *
 * Não existe allowlist de verticais/nichos aqui. O runtime descobre a vertical
 * pelo template pinado na App Instance, portanto o mesmo contrato atende todos
 * os segmentos atuais e futuros sem branches de código por setor.
 *
 * Importante: somente snapshots publicados são lidos. app_instances contém o
 * working draft e nunca é usado como fonte de theme/navigation/settings.
 */
router.get("/app-runtime/apps", async (req, res) => {
  const tenantId = requireTenantContext(req, res);
  if (!tenantId) return;
  privateRuntimeResponse(res);

  const apps = await db
    .select({
      id: appInstancesTable.id,
      templateId: appInstancesTable.templateId,
      updatedAt: appInstancesTable.updatedAt,
    })
    .from(appInstancesTable)
    .where(
      and(
        eq(appInstancesTable.tenantId, tenantId),
        eq(appInstancesTable.status, "published"),
      ),
    )
    .orderBy(desc(appInstancesTable.updatedAt));

  const resolved = await Promise.all(
    apps.map(async (app) => {
      const [snapshot] = await db
        .select({
          id: appInstanceVersionsTable.id,
          version: appInstanceVersionsTable.version,
          definition: appInstanceVersionsTable.definition,
          templateVersionId: appInstanceVersionsTable.templateVersionId,
          publishedAt: appInstanceVersionsTable.publishedAt,
        })
        .from(appInstanceVersionsTable)
        .where(
          and(
            eq(appInstanceVersionsTable.tenantId, tenantId),
            eq(appInstanceVersionsTable.appInstanceId, app.id),
            eq(appInstanceVersionsTable.status, "published"),
          ),
        )
        .orderBy(desc(appInstanceVersionsTable.publishedAt), desc(appInstanceVersionsTable.version))
        .limit(1);

      if (!snapshot) return null;
      const definition = asObject(snapshot.definition);

      return {
        appInstanceId: app.id,
        templateId: app.templateId,
        templateVersionId: snapshot.templateVersionId,
        publishedVersionId: snapshot.id,
        publishedVersion: snapshot.version,
        publishedAt: snapshot.publishedAt,
        name: stringField(definition.name),
        slug: stringField(definition.slug),
      };
    }),
  );

  res.json(resolved.filter((row): row is NonNullable<typeof row> => row !== null));
});

router.get("/app-runtime/apps/:appId", async (req, res) => {
  const tenantId = requireTenantContext(req, res);
  if (!tenantId) return;
  privateRuntimeResponse(res);

  const appInstanceId = String(req.params.appId);
  const [app] = await db
    .select({
      id: appInstancesTable.id,
      templateId: appInstancesTable.templateId,
    })
    .from(appInstancesTable)
    .where(
      and(
        eq(appInstancesTable.id, appInstanceId),
        eq(appInstancesTable.tenantId, tenantId),
        eq(appInstancesTable.status, "published"),
      ),
    );

  // 404 único para inexistente, não publicado ou pertencente a outro tenant:
  // evita transformar o endpoint em um enumerador cross-tenant.
  if (!app) {
    res.status(404).json({ error: "APP_NOT_PUBLISHED" });
    return;
  }

  const [snapshot] = await db
    .select({
      id: appInstanceVersionsTable.id,
      version: appInstanceVersionsTable.version,
      definition: appInstanceVersionsTable.definition,
      templateVersionId: appInstanceVersionsTable.templateVersionId,
      publishedAt: appInstanceVersionsTable.publishedAt,
    })
    .from(appInstanceVersionsTable)
    .where(
      and(
        eq(appInstanceVersionsTable.tenantId, tenantId),
        eq(appInstanceVersionsTable.appInstanceId, app.id),
        eq(appInstanceVersionsTable.status, "published"),
      ),
    )
    .orderBy(desc(appInstanceVersionsTable.publishedAt), desc(appInstanceVersionsTable.version))
    .limit(1);

  if (!snapshot) {
    res.status(409).json({
      error: "PUBLISHED_SNAPSHOT_MISSING",
      message: "A instância está marcada como publicada, mas não possui snapshot publicado.",
    });
    return;
  }

  if (!snapshot.templateVersionId) {
    res.status(409).json({ error: "TEMPLATE_VERSION_MISSING" });
    return;
  }

  const [templateVersion] = await db
    .select({
      id: appTemplateVersionsTable.id,
      templateId: appTemplateVersionsTable.templateId,
      version: appTemplateVersionsTable.version,
      definition: appTemplateVersionsTable.definition,
      publishedAt: appTemplateVersionsTable.publishedAt,
    })
    .from(appTemplateVersionsTable)
    .where(
      and(
        eq(appTemplateVersionsTable.id, snapshot.templateVersionId),
        eq(appTemplateVersionsTable.templateId, app.templateId),
      ),
    );

  if (!templateVersion) {
    res.status(409).json({ error: "PINNED_TEMPLATE_VERSION_NOT_FOUND" });
    return;
  }

  const [template] = await db
    .select({
      id: appTemplatesTable.id,
      verticalId: appTemplatesTable.verticalId,
      parentTemplateId: appTemplatesTable.parentTemplateId,
      name: appTemplatesTable.name,
      slug: appTemplatesTable.slug,
      description: appTemplatesTable.description,
    })
    .from(appTemplatesTable)
    .where(eq(appTemplatesTable.id, app.templateId));

  if (!template) {
    res.status(409).json({ error: "PINNED_TEMPLATE_NOT_FOUND" });
    return;
  }

  const [vertical] = await db
    .select({
      id: appVerticalsTable.id,
      key: appVerticalsTable.key,
      name: appVerticalsTable.name,
      familyKey: appVerticalsTable.familyKey,
      metadata: appVerticalsTable.metadata,
    })
    .from(appVerticalsTable)
    .where(eq(appVerticalsTable.id, template.verticalId));

  if (!vertical) {
    res.status(409).json({ error: "VERTICAL_NOT_FOUND" });
    return;
  }

  const [componentsRaw, featuresRaw, actionsRaw, workflowsRaw, aiPoliciesRaw] = await Promise.all([
    db.select().from(appComponentRegistryTable),
    db.select().from(appFeatureRegistryTable),
    db.select().from(appActionRegistryTable),
    db.select().from(appWorkflowRegistryTable),
    db.select({
      id: appAiPoliciesTable.id,
      verticalId: appAiPoliciesTable.verticalId,
      key: appAiPoliciesTable.key,
      name: appAiPoliciesTable.name,
      riskLevel: appAiPoliciesTable.riskLevel,
      status: appAiPoliciesTable.status,
    }).from(appAiPoliciesTable),
  ]);

  // Deprecated permanece disponível para compatibilidade de apps já publicados.
  // Archived é removido do catálogo de runtime. Regras de IA ficam server-side.
  const components = componentsRaw.filter((item) => item.status !== "archived");
  const features = featuresRaw.filter((item) => item.status !== "archived");
  const actions = actionsRaw.filter((item) => item.status !== "archived");
  const workflows = workflowsRaw.filter((item) => item.status !== "archived");
  const aiPolicyRefs = aiPoliciesRaw.filter(
    (item) => item.status !== "archived" && (item.verticalId === null || item.verticalId === vertical.id),
  );

  res.json({
    runtimeVersion: 1,
    registryCatalogVersion: 1,
    app: {
      appInstanceId: app.id,
      publishedVersionId: snapshot.id,
      publishedVersion: snapshot.version,
      publishedAt: snapshot.publishedAt,
      definition: snapshot.definition,
    },
    template: {
      id: template.id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      parentTemplateId: template.parentTemplateId,
      version: {
        id: templateVersion.id,
        number: templateVersion.version,
        publishedAt: templateVersion.publishedAt,
        definition: templateVersion.definition,
      },
    },
    vertical,
    registries: {
      components,
      features,
      actions,
      workflows,
      aiPolicies: aiPolicyRefs,
    },
  });
});

export default router;
