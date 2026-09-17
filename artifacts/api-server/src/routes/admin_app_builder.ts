import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNotNull, max } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appActionRegistryTable,
  appAiPoliciesTable,
  appComponentRegistryTable,
  appDataSourceRegistryTable,
  appFeatureRegistryTable,
  appInstancesTable,
  appInstanceVersionsTable,
  appTemplateVersionsTable,
  appTemplatesTable,
  appVerticalsTable,
  appWorkflowRegistryTable,
  createAppInstanceSchema,
  createAppTemplateSchema,
  createAppVerticalSchema,
  db,
  tenantsTable,
} from "@workspace/db";
import { resolveAppTenantBranding } from "../lib/app_tenant_branding.js";
import { buildVerticalStarterDefinition, findVerticalBlueprint, resolveVerticalBlueprint, VERTICAL_BLUEPRINTS, type RegistryCapability } from "../lib/app_vertical_blueprints.js";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// App Builder é uma ferramenta de autoria da plataforma. Tenants recebem
// instâncias configuradas, mas não administram templates/registries globais.
router.use(requireRole("super_admin"));

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use somente letras minúsculas, números e hífen");

const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Chave inválida");

const jsonObjectSchema = z.record(z.string(), z.unknown());

const verticalCreateSchema = createAppVerticalSchema.extend({ key: keySchema });
const verticalPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    familyKey: keySchema.nullable(),
    status: z.enum(["active", "inactive", "archived"]),
    metadata: jsonObjectSchema,
  })
  .partial();

const templateCreateSchema = createAppTemplateSchema.extend({ slug: slugSchema });
const templatePatchSchema = z
  .object({
    parentTemplateId: z.string().min(1).nullable(),
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    description: z.string().trim().max(1000).nullable(),
    status: z.enum(["draft", "active", "archived"]),
    settings: jsonObjectSchema,
  })
  .partial();

const templateVersionCreateSchema = z.object({
  definition: jsonObjectSchema,
  changeLog: z.string().trim().max(2000).nullable().optional(),
});

const appInstanceCreateSchema = createAppInstanceSchema.extend({ slug: slugSchema });
const appInstancePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    // "published" é deliberadamente excluído: publicar exige snapshot versionado.
    status: z.enum(["draft", "preview", "archived"]),
    theme: jsonObjectSchema,
    navigation: z.array(z.unknown()),
    settings: jsonObjectSchema,
    whiteLabel: jsonObjectSchema,
  })
  .partial();

const componentRegistrySchema = z.object({
  key: keySchema,
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().max(80).nullable().optional(),
  configSchema: jsonObjectSchema.default({}),
  defaultProps: jsonObjectSchema.default({}),
});

const featureRegistrySchema = z.object({
  key: keySchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  configSchema: jsonObjectSchema.default({}),
});

const actionRegistrySchema = z.object({
  key: keySchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  inputSchema: jsonObjectSchema.default({}),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
});

const workflowRegistrySchema = z.object({
  key: keySchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  triggerSchema: jsonObjectSchema.default({}),
});

const aiPolicyRegistrySchema = z.object({
  verticalId: z.string().min(1).nullable().optional(),
  key: keySchema,
  name: z.string().trim().min(2).max(120),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  rules: jsonObjectSchema.default({}),
});

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

async function validateParentTemplate(verticalId: string, parentTemplateId?: string | null) {
  if (!parentTemplateId) return true;
  const [parent] = await db
    .select({ verticalId: appTemplatesTable.verticalId })
    .from(appTemplatesTable)
    .where(eq(appTemplatesTable.id, parentTemplateId));
  return parent?.verticalId === verticalId;
}

router.get("/admin/app-builder/verticals", async (_req, res) => {
  const rows = await db
    .select()
    .from(appVerticalsTable)
    .orderBy(asc(appVerticalsTable.name));
  res.json(rows);
});

router.post("/admin/app-builder/verticals", async (req, res) => {
  const parsed = verticalCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db.insert(appVerticalsTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe uma vertical com essa chave" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/app-builder/verticals/:id", async (req, res) => {
  const parsed = verticalPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(appVerticalsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(appVerticalsTable.id, String(req.params.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Vertical não encontrada" });
    return;
  }
  res.json(row);
});

router.get("/admin/app-builder/templates", async (req, res) => {
  const verticalId = typeof req.query.verticalId === "string" ? req.query.verticalId : undefined;
  const rows = verticalId
    ? await db
        .select()
        .from(appTemplatesTable)
        .where(eq(appTemplatesTable.verticalId, verticalId))
        .orderBy(asc(appTemplatesTable.name))
    : await db.select().from(appTemplatesTable).orderBy(asc(appTemplatesTable.name));
  res.json(rows);
});

router.post("/admin/app-builder/templates", async (req, res) => {
  const parsed = templateCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [vertical] = await db
    .select({ id: appVerticalsTable.id })
    .from(appVerticalsTable)
    .where(eq(appVerticalsTable.id, parsed.data.verticalId));
  if (!vertical) {
    res.status(422).json({ error: "Vertical inválida" });
    return;
  }
  if (!(await validateParentTemplate(parsed.data.verticalId, parsed.data.parentTemplateId))) {
    res.status(422).json({ error: "Template pai precisa pertencer à mesma vertical" });
    return;
  }

  try {
    const [row] = await db.insert(appTemplatesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um template com esse slug nesta vertical" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/app-builder/templates/:id", async (req, res) => {
  const parsed = templatePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const id = String(req.params.id);
  const [current] = await db
    .select({ verticalId: appTemplatesTable.verticalId })
    .from(appTemplatesTable)
    .where(eq(appTemplatesTable.id, id));
  if (!current) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }
  if (!(await validateParentTemplate(current.verticalId, parsed.data.parentTemplateId))) {
    res.status(422).json({ error: "Template pai precisa pertencer à mesma vertical" });
    return;
  }
  if (parsed.data.parentTemplateId === id) {
    res.status(422).json({ error: "Um template não pode herdar de si mesmo" });
    return;
  }

  try {
    const [row] = await db
      .update(appTemplatesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(appTemplatesTable.id, id))
      .returning();
    res.json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um template com esse slug nesta vertical" });
      return;
    }
    throw error;
  }
});

router.get("/admin/app-builder/templates/:id/versions", async (req, res) => {
  const rows = await db
    .select()
    .from(appTemplateVersionsTable)
    .where(eq(appTemplateVersionsTable.templateId, String(req.params.id)))
    .orderBy(desc(appTemplateVersionsTable.version));
  res.json(rows);
});

router.post("/admin/app-builder/templates/:id/versions", async (req, res) => {
  const parsed = templateVersionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const templateId = String(req.params.id);
  const [template] = await db
    .select({ id: appTemplatesTable.id })
    .from(appTemplatesTable)
    .where(eq(appTemplatesTable.id, templateId));
  if (!template) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }

  const [latest] = await db
    .select({ version: max(appTemplateVersionsTable.version) })
    .from(appTemplateVersionsTable)
    .where(eq(appTemplateVersionsTable.templateId, templateId));
  const version = (latest?.version ?? 0) + 1;

  try {
    const [row] = await db
      .insert(appTemplateVersionsTable)
      .values({
        templateId,
        version,
        definition: parsed.data.definition,
        changeLog: parsed.data.changeLog ?? null,
        status: "draft",
      })
      .returning();
    res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Versão concorrente detectada; tente novamente" });
      return;
    }
    throw error;
  }
});

router.post("/admin/app-builder/templates/:templateId/versions/:versionId/publish", async (req, res) => {
  const [row] = await db
    .update(appTemplateVersionsTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(
      and(
        eq(appTemplateVersionsTable.id, String(req.params.versionId)),
        eq(appTemplateVersionsTable.templateId, String(req.params.templateId)),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Versão não encontrada" });
    return;
  }
  res.json(row);
});

router.get("/admin/app-builder/apps", async (req, res) => {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const rows = tenantId
    ? await db
        .select()
        .from(appInstancesTable)
        .where(eq(appInstancesTable.tenantId, tenantId))
        .orderBy(desc(appInstancesTable.updatedAt))
    : await db.select().from(appInstancesTable).orderBy(desc(appInstancesTable.updatedAt));
  res.json(rows);
});

router.post("/admin/app-builder/apps", async (req, res) => {
  const parsed = appInstanceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, parsed.data.tenantId));
  if (!tenant) {
    res.status(422).json({ error: "Tenant inválido" });
    return;
  }

  const [templateVersion] = await db
    .select({
      id: appTemplateVersionsTable.id,
      templateId: appTemplateVersionsTable.templateId,
      status: appTemplateVersionsTable.status,
    })
    .from(appTemplateVersionsTable)
    .where(eq(appTemplateVersionsTable.id, parsed.data.templateVersionId));
  if (!templateVersion || templateVersion.templateId !== parsed.data.templateId) {
    res.status(422).json({ error: "A versão informada não pertence ao template" });
    return;
  }
  if (templateVersion.status !== "published") {
    res.status(422).json({ error: "Somente versões publicadas podem originar um app" });
    return;
  }

  try {
    // Persist only app-level choices. Tenant branding is resolved at read/runtime
    // so later tenant logo/color changes propagate without rewriting every app.
    const [row] = await db.insert(appInstancesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um app com esse slug para o tenant" });
      return;
    }
    throw error;
  }
});

router.get("/admin/app-builder/apps/:id/branding", async (req, res) => {
  const [app] = await db
    .select()
    .from(appInstancesTable)
    .where(eq(appInstancesTable.id, String(req.params.id)));
  if (!app) {
    res.status(404).json({ error: "App não encontrado" });
    return;
  }
  const resolved = await resolveAppTenantBranding(
    app.tenantId,
    app.name,
    app.theme,
    app.whiteLabel,
  );
  res.json({
    stored: { theme: app.theme, whiteLabel: app.whiteLabel },
    resolved,
  });
});
router.patch("/admin/app-builder/apps/:id", async (req, res) => {
  const parsed = appInstancePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db
      .update(appInstancesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(appInstancesTable.id, String(req.params.id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "App não encontrado" });
      return;
    }
    res.json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um app com esse slug para o tenant" });
      return;
    }
    throw error;
  }
});

router.get("/admin/app-builder/apps/:id/versions", async (req, res) => {
  const appInstanceId = String(req.params.id);
  const rows = await db
    .select()
    .from(appInstanceVersionsTable)
    .where(eq(appInstanceVersionsTable.appInstanceId, appInstanceId))
    .orderBy(desc(appInstanceVersionsTable.version));
  res.json(rows);
});

router.post("/admin/app-builder/apps/:id/versions", async (req, res) => {
  const appInstanceId = String(req.params.id);
  const [app] = await db
    .select()
    .from(appInstancesTable)
    .where(eq(appInstancesTable.id, appInstanceId));
  if (!app) {
    res.status(404).json({ error: "App não encontrado" });
    return;
  }
  if (app.status === "archived") {
    res.status(409).json({ error: "App arquivado não pode receber novas versões" });
    return;
  }

  const [latest] = await db
    .select({ version: max(appInstanceVersionsTable.version) })
    .from(appInstanceVersionsTable)
    .where(eq(appInstanceVersionsTable.appInstanceId, appInstanceId));
  const version = (latest?.version ?? 0) + 1;

  const definition = {
    name: app.name,
    slug: app.slug,
    templateId: app.templateId,
    templateVersionId: app.templateVersionId,
    theme: app.theme,
    navigation: app.navigation,
    settings: app.settings,
    whiteLabel: app.whiteLabel,
  };

  try {
    const [row] = await db
      .insert(appInstanceVersionsTable)
      .values({
        tenantId: app.tenantId,
        appInstanceId: app.id,
        templateVersionId: app.templateVersionId,
        version,
        status: "draft",
        definition,
      })
      .returning();
    res.status(201).json(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Versão concorrente detectada; tente novamente" });
      return;
    }
    throw error;
  }
});

router.post("/admin/app-builder/apps/:appId/versions/:versionId/publish", async (req, res) => {
  const appInstanceId = String(req.params.appId);
  const versionId = String(req.params.versionId);

  const [target] = await db
    .select({ id: appInstanceVersionsTable.id })
    .from(appInstanceVersionsTable)
    .where(
      and(
        eq(appInstanceVersionsTable.id, versionId),
        eq(appInstanceVersionsTable.appInstanceId, appInstanceId),
      ),
    );
  if (!target) {
    res.status(404).json({ error: "Versão do app não encontrada" });
    return;
  }

  const published = await db.transaction(async (tx) => {
    await tx
      .update(appInstanceVersionsTable)
      .set({ status: "archived" })
      .where(
        and(
          eq(appInstanceVersionsTable.appInstanceId, appInstanceId),
          eq(appInstanceVersionsTable.status, "published"),
        ),
      );

    const [row] = await tx
      .update(appInstanceVersionsTable)
      .set({ status: "published", publishedAt: new Date() })
      .where(
        and(
          eq(appInstanceVersionsTable.id, versionId),
          eq(appInstanceVersionsTable.appInstanceId, appInstanceId),
        ),
      )
      .returning();

    await tx
      .update(appInstancesTable)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(appInstancesTable.id, appInstanceId));

    return row;
  });

  res.json(published);
});

router.post("/admin/app-builder/vertical-blueprints/materialize-all", async (_req, res) => {
  const [components, features, actions, workflows, dataSources] = await Promise.all([
    db.select({ key: appComponentRegistryTable.key, name: appComponentRegistryTable.name, category: appComponentRegistryTable.category }).from(appComponentRegistryTable).where(eq(appComponentRegistryTable.status, "active")),
    db.select({ key: appFeatureRegistryTable.key, name: appFeatureRegistryTable.name, category: appFeatureRegistryTable.category }).from(appFeatureRegistryTable).where(eq(appFeatureRegistryTable.status, "active")),
    db.select({ key: appActionRegistryTable.key, name: appActionRegistryTable.name, category: appActionRegistryTable.category, executorKey: appActionRegistryTable.executorKey }).from(appActionRegistryTable).where(and(eq(appActionRegistryTable.status, "active"), isNotNull(appActionRegistryTable.executorKey))),
    db.select({ key: appWorkflowRegistryTable.key, name: appWorkflowRegistryTable.name }).from(appWorkflowRegistryTable).where(eq(appWorkflowRegistryTable.status, "active")),
    db.select({ key: appDataSourceRegistryTable.key, name: appDataSourceRegistryTable.name, category: appDataSourceRegistryTable.category }).from(appDataSourceRegistryTable).where(eq(appDataSourceRegistryTable.status, "active")),
  ]);
  const registry: RegistryCapability[] = [
    ...components.map((item) => ({ ...item, kind: "component" as const })),
    ...features.map((item) => ({ ...item, kind: "feature" as const })),
    ...actions.map((item) => ({ ...item, kind: "action" as const })),
    ...workflows.map((item) => ({ ...item, category: null, kind: "workflow" as const })),
    ...dataSources.map((item) => ({ ...item, kind: "dataSource" as const })),
  ];

  const materialized = await db.transaction(async (tx) => {
    const rows: Array<{ key: string; templateId: string; templateVersionId: string; created: boolean }> = [];
    for (const blueprint of VERTICAL_BLUEPRINTS) {
      const resolution = resolveVerticalBlueprint(blueprint, registry);
      let [vertical] = await tx.select().from(appVerticalsTable).where(eq(appVerticalsTable.key, blueprint.key)).limit(1);
      if (!vertical) {
        [vertical] = await tx.insert(appVerticalsTable).values({ key: blueprint.key, name: blueprint.name, familyKey: blueprint.familyKey, status: "active", metadata: { system: true, blueprint: true, description: blueprint.description } }).returning();
      }
      const slug = `base-${blueprint.key}`;
      let [template] = await tx.select().from(appTemplatesTable).where(and(eq(appTemplatesTable.verticalId, vertical.id), eq(appTemplatesTable.slug, slug))).limit(1);
      if (!template) {
        [template] = await tx.insert(appTemplatesTable).values({ verticalId: vertical.id, name: `Base · ${blueprint.name}`, slug, description: blueprint.description, status: "active", settings: { system: true, blueprintKey: blueprint.key, generated: true } }).returning();
      }
      let [version] = await tx.select().from(appTemplateVersionsTable).where(and(eq(appTemplateVersionsTable.templateId, template.id), eq(appTemplateVersionsTable.status, "published"))).orderBy(desc(appTemplateVersionsTable.version)).limit(1);
      let created = false;
      if (!version) {
        const [latest] = await tx.select({ value: max(appTemplateVersionsTable.version) }).from(appTemplateVersionsTable).where(eq(appTemplateVersionsTable.templateId, template.id));
        [version] = await tx.insert(appTemplateVersionsTable).values({ templateId: template.id, version: (latest?.value ?? 0) + 1, status: "published", definition: buildVerticalStarterDefinition(blueprint, resolution, registry), changeLog: `Base automática do blueprint ${blueprint.name}`, publishedAt: new Date() }).returning();
        created = true;
      }
      rows.push({ key: blueprint.key, templateId: template.id, templateVersionId: version.id, created });
    }
    return rows;
  });

  res.json({ total: materialized.length, created: materialized.filter((item) => item.created).length, reused: materialized.filter((item) => !item.created).length, items: materialized });
});
router.post("/admin/app-builder/vertical-blueprints/:key/materialize", async (req, res) => {
  const blueprint = findVerticalBlueprint(String(req.params.key));
  if (!blueprint) return void res.status(404).json({ error: "Blueprint de vertical não encontrado" });

  const [components, features, actions, workflows, dataSources] = await Promise.all([
    db.select({ key: appComponentRegistryTable.key, name: appComponentRegistryTable.name, category: appComponentRegistryTable.category }).from(appComponentRegistryTable).where(eq(appComponentRegistryTable.status, "active")),
    db.select({ key: appFeatureRegistryTable.key, name: appFeatureRegistryTable.name, category: appFeatureRegistryTable.category }).from(appFeatureRegistryTable).where(eq(appFeatureRegistryTable.status, "active")),
    db.select({ key: appActionRegistryTable.key, name: appActionRegistryTable.name, category: appActionRegistryTable.category, executorKey: appActionRegistryTable.executorKey }).from(appActionRegistryTable).where(and(eq(appActionRegistryTable.status, "active"), isNotNull(appActionRegistryTable.executorKey))),
    db.select({ key: appWorkflowRegistryTable.key, name: appWorkflowRegistryTable.name }).from(appWorkflowRegistryTable).where(eq(appWorkflowRegistryTable.status, "active")),
    db.select({ key: appDataSourceRegistryTable.key, name: appDataSourceRegistryTable.name, category: appDataSourceRegistryTable.category }).from(appDataSourceRegistryTable).where(eq(appDataSourceRegistryTable.status, "active")),
  ]);
  const registry: RegistryCapability[] = [
    ...components.map((item) => ({ ...item, kind: "component" as const })),
    ...features.map((item) => ({ ...item, kind: "feature" as const })),
    ...actions.map((item) => ({ ...item, kind: "action" as const })),
    ...workflows.map((item) => ({ ...item, category: null, kind: "workflow" as const })),
    ...dataSources.map((item) => ({ ...item, kind: "dataSource" as const })),
  ];
  const resolution = resolveVerticalBlueprint(blueprint, registry);
  const definition = buildVerticalStarterDefinition(blueprint, resolution, registry);

  const result = await db.transaction(async (tx) => {
    let [vertical] = await tx.select().from(appVerticalsTable).where(eq(appVerticalsTable.key, blueprint.key)).limit(1);
    if (!vertical) {
      [vertical] = await tx.insert(appVerticalsTable).values({
        key: blueprint.key,
        name: blueprint.name,
        familyKey: blueprint.familyKey,
        status: "active",
        metadata: { system: true, blueprint: true, description: blueprint.description },
      }).returning();
    }

    const slug = `base-${blueprint.key}`;
    let [template] = await tx.select().from(appTemplatesTable).where(and(eq(appTemplatesTable.verticalId, vertical.id), eq(appTemplatesTable.slug, slug))).limit(1);
    if (!template) {
      [template] = await tx.insert(appTemplatesTable).values({
        verticalId: vertical.id,
        name: `Base · ${blueprint.name}`,
        slug,
        description: blueprint.description,
        status: "active",
        settings: { system: true, blueprintKey: blueprint.key, generated: true },
      }).returning();
    }

    let [version] = await tx.select().from(appTemplateVersionsTable).where(and(eq(appTemplateVersionsTable.templateId, template.id), eq(appTemplateVersionsTable.status, "published"))).orderBy(desc(appTemplateVersionsTable.version)).limit(1);
    if (!version) {
      const [latest] = await tx.select({ value: max(appTemplateVersionsTable.version) }).from(appTemplateVersionsTable).where(eq(appTemplateVersionsTable.templateId, template.id));
      [version] = await tx.insert(appTemplateVersionsTable).values({
        templateId: template.id,
        version: (latest?.value ?? 0) + 1,
        status: "published",
        definition,
        changeLog: `Base automática do blueprint ${blueprint.name}`,
        publishedAt: new Date(),
      }).returning();
    }
    return { vertical, template, version };
  });

  res.status(201).json({
    verticalId: result.vertical.id,
    templateId: result.template.id,
    templateVersionId: result.version.id,
    blueprint: resolution.blueprint,
    reuse: resolution.summary,
  });
});
router.get("/admin/app-builder/vertical-blueprints", async (req, res) => {
  const [components, features, actions, workflows, dataSources] = await Promise.all([
    db.select({ key: appComponentRegistryTable.key, name: appComponentRegistryTable.name, category: appComponentRegistryTable.category }).from(appComponentRegistryTable).where(eq(appComponentRegistryTable.status, "active")),
    db.select({ key: appFeatureRegistryTable.key, name: appFeatureRegistryTable.name, category: appFeatureRegistryTable.category }).from(appFeatureRegistryTable).where(eq(appFeatureRegistryTable.status, "active")),
    db.select({ key: appActionRegistryTable.key, name: appActionRegistryTable.name, category: appActionRegistryTable.category, executorKey: appActionRegistryTable.executorKey }).from(appActionRegistryTable).where(and(eq(appActionRegistryTable.status, "active"), isNotNull(appActionRegistryTable.executorKey))),
    db.select({ key: appWorkflowRegistryTable.key, name: appWorkflowRegistryTable.name }).from(appWorkflowRegistryTable).where(eq(appWorkflowRegistryTable.status, "active")),
    db.select({ key: appDataSourceRegistryTable.key, name: appDataSourceRegistryTable.name, category: appDataSourceRegistryTable.category }).from(appDataSourceRegistryTable).where(eq(appDataSourceRegistryTable.status, "active")),
  ]);
  const registry: RegistryCapability[] = [
    ...components.map((item) => ({ ...item, kind: "component" as const })),
    ...features.map((item) => ({ ...item, kind: "feature" as const })),
    ...actions.map((item) => ({ ...item, kind: "action" as const })),
    ...workflows.map((item) => ({ ...item, category: null, kind: "workflow" as const })),
    ...dataSources.map((item) => ({ ...item, kind: "dataSource" as const })),
  ];
  const requested = typeof req.query.key === "string" ? findVerticalBlueprint(req.query.key) : null;
  if (typeof req.query.key === "string" && !requested) return void res.status(404).json({ error: "Blueprint de vertical não encontrado" });
  const blueprints = requested ? [requested] : VERTICAL_BLUEPRINTS;
  res.json(blueprints.map((item) => resolveVerticalBlueprint(item, registry)));
});
router.get("/admin/app-builder/registries", async (_req, res) => {
  const [components, features, actions, workflows, aiPolicies, dataSources] = await Promise.all([
    db.select().from(appComponentRegistryTable).orderBy(asc(appComponentRegistryTable.name)),
    db.select().from(appFeatureRegistryTable).orderBy(asc(appFeatureRegistryTable.name)),
    db.select().from(appActionRegistryTable).orderBy(asc(appActionRegistryTable.name)),
    db.select().from(appWorkflowRegistryTable).orderBy(asc(appWorkflowRegistryTable.name)),
    db.select().from(appAiPoliciesTable).orderBy(asc(appAiPoliciesTable.name)),
    db.select().from(appDataSourceRegistryTable).orderBy(asc(appDataSourceRegistryTable.name)),
  ]);
  res.json({ components, features, actions, workflows, aiPolicies, dataSources });
});

router.post("/admin/app-builder/registries/:kind", async (req, res) => {
  const kind = String(req.params.kind);
  try {
    if (kind === "components") {
      const parsed = componentRegistrySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
      const [row] = await db.insert(appComponentRegistryTable).values(parsed.data).returning();
      return void res.status(201).json(row);
    }
    if (kind === "features") {
      const parsed = featureRegistrySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
      const [row] = await db.insert(appFeatureRegistryTable).values(parsed.data).returning();
      return void res.status(201).json(row);
    }
    if (kind === "actions") {
      const parsed = actionRegistrySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
      const [row] = await db.insert(appActionRegistryTable).values(parsed.data).returning();
      return void res.status(201).json(row);
    }
    if (kind === "workflows") {
      const parsed = workflowRegistrySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
      const [row] = await db.insert(appWorkflowRegistryTable).values(parsed.data).returning();
      return void res.status(201).json(row);
    }
    if (kind === "ai-policies") {
      const parsed = aiPolicyRegistrySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
      if (parsed.data.verticalId) {
        const [vertical] = await db
          .select({ id: appVerticalsTable.id })
          .from(appVerticalsTable)
          .where(eq(appVerticalsTable.id, parsed.data.verticalId));
        if (!vertical) return void res.status(422).json({ error: "Vertical inválida" });
      }
      const [row] = await db.insert(appAiPoliciesTable).values(parsed.data).returning();
      return void res.status(201).json(row);
    }
    // Data Sources são intencionalmente somente leitura nesta API. O executor_key
    // continua controlado por código/migrations para impedir SQL/URL/código arbitrário.
    res.status(404).json({ error: "Registry desconhecido" });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um item com essa chave" });
      return;
    }
    throw error;
  }
});

export default router;