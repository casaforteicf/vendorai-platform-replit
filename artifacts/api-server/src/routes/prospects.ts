import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  prospectsTable,
  crmCompaniesMasterTable,
  crmTenantCompaniesTable,
  crmTenantCompanyContactsTable,
  crmPeopleMasterTable,
  insertProspectSchema,
  updateProspectSchema,
} from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import { decideProspectNextAction } from "../services/prospect-decision-engine.js";

const router: IRouter = Router();
const base = "/tenants/:tenantId/prospects";
router.use(base, requireSameTenanOrSuperAdmin());

router.get(base, async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const rows = await db
    .select({
      prospect: prospectsTable,
      company: crmCompaniesMasterTable,
    })
    .from(prospectsTable)
    .innerJoin(crmCompaniesMasterTable, eq(prospectsTable.companyId, crmCompaniesMasterTable.id))
    .where(eq(prospectsTable.tenantId, tenantId))
    .orderBy(desc(prospectsTable.updatedAt));
  res.json(rows);
});

router.post(base, async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const parsed = insertProspectSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

  const [companyLink] = await db
    .select({ companyId: crmTenantCompaniesTable.companyId })
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, parsed.data.companyId),
    ))
    .limit(1);
  if (!companyLink) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });

  const decision = decideProspectNextAction({
    stage: parsed.data.stage ?? "encontrado",
    vendoraiFitScore: parsed.data.vendoraiFitScore ?? null,
    arqdorFitScore: parsed.data.arqdorFitScore ?? null,
    qualification: parsed.data.qualification ?? {},
    opportunitySummary: parsed.data.opportunitySummary ?? null,
  });

  try {
    const [created] = await db.insert(prospectsTable).values({
      ...parsed.data,
      stage: decision.stage,
      currentState: parsed.data.currentState ?? decision.currentState,
      currentObjective: parsed.data.currentObjective ?? decision.currentObjective,
      nextBestAction: parsed.data.nextBestAction ?? decision.nextBestAction,
      nextBestActionReason: parsed.data.nextBestActionReason ?? decision.nextBestActionReason,
      recommendedSolution: parsed.data.recommendedSolution ?? decision.recommendedSolution,
      primaryHook: parsed.data.primaryHook ?? decision.primaryHook,
    }).returning();
    return res.status(201).json(created);
  } catch (error) {
    req.log.warn({ error, tenantId, companyId: parsed.data.companyId }, "prospects: create failed");
    return res.status(409).json({ error: "Já existe um prospect desta empresa no tenant ou os dados conflitam." });
  }
});

router.get(base + "/:prospectId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const prospectId = String(req.params["prospectId"]);

  const [row] = await db.select({
    prospect: prospectsTable,
    company: crmCompaniesMasterTable,
    tenantCompanyId: crmTenantCompaniesTable.id,
  })
    .from(prospectsTable)
    .innerJoin(crmCompaniesMasterTable, eq(prospectsTable.companyId, crmCompaniesMasterTable.id))
    .leftJoin(crmTenantCompaniesTable, and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, prospectsTable.companyId),
    ))
    .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Prospect não encontrado" });

  const accountMap = row.tenantCompanyId
    ? await db.select({
        contact: crmTenantCompanyContactsTable,
        person: crmPeopleMasterTable,
      })
      .from(crmTenantCompanyContactsTable)
      .innerJoin(crmPeopleMasterTable, eq(crmTenantCompanyContactsTable.personId, crmPeopleMasterTable.id))
      .where(and(
        eq(crmTenantCompanyContactsTable.tenantId, tenantId),
        eq(crmTenantCompanyContactsTable.tenantCompanyId, row.tenantCompanyId),
      ))
    : [];

  return res.json({ ...row, accountMap });
});

router.patch(base + "/:prospectId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const prospectId = String(req.params["prospectId"]);
  const parsed = updateProspectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

  const [current] = await db.select().from(prospectsTable)
    .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.tenantId, tenantId)))
    .limit(1);
  if (!current) return res.status(404).json({ error: "Prospect não encontrado" });

  const merged = { ...current, ...parsed.data };
  const decision = decideProspectNextAction({
    stage: merged.stage,
    vendoraiFitScore: merged.vendoraiFitScore,
    arqdorFitScore: merged.arqdorFitScore,
    qualification: merged.qualification,
    opportunitySummary: merged.opportunitySummary,
  });

  const [updated] = await db.update(prospectsTable).set({
    ...parsed.data,
    stage: decision.stage,
    currentState: decision.currentState,
    currentObjective: decision.currentObjective,
    nextBestAction: decision.nextBestAction,
    nextBestActionReason: decision.nextBestActionReason,
    recommendedSolution: decision.recommendedSolution,
    primaryHook: decision.primaryHook,
    updatedAt: new Date(),
  })
    .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.tenantId, tenantId)))
    .returning();

  return res.json(updated);
});

router.post(base + "/:prospectId/recalculate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const prospectId = String(req.params["prospectId"]);
  const [current] = await db.select().from(prospectsTable)
    .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.tenantId, tenantId)))
    .limit(1);
  if (!current) return res.status(404).json({ error: "Prospect não encontrado" });

  const decision = decideProspectNextAction(current);
  const [updated] = await db.update(prospectsTable).set({
    ...decision,
    updatedAt: new Date(),
  }).where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.tenantId, tenantId))).returning();

  return res.json(updated);
});

export default router;
