import { Router, type IRouter } from "express";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appActionRegistryTable,
  appAiPoliciesTable,
  appComponentRegistryTable,
  appFeatureRegistryTable,
  appInstancesTable,
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
    status: z.enum(["draft", "preview", "published", "archived"]),
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

router.get("/admin/app-builder/registries", async (_req, res) => {
  const [components, features, actions, workflows, aiPolicies] = await Promise.all([
    db.select().from(appComponentRegistryTable).orderBy(asc(appComponentRegistryTable.name)),
    db.select().from(appFeatureRegistryTable).orderBy(asc(appFeatureRegistryTable.name)),
    db.select().from(appActionRegistryTable).orderBy(asc(appActionRegistryTable.name)),
    db.select().from(appWorkflowRegistryTable).orderBy(asc(appWorkflowRegistryTable.name)),
    db.select().from(appAiPoliciesTable).orderBy(asc(appAiPoliciesTable.name)),
  ]);
  res.json({ components, features, actions, workflows, aiPolicies });
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
