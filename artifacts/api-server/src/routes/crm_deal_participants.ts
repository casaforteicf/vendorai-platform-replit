import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  dealsTable,
  crmPeopleMasterTable,
  crmCompaniesMasterTable,
  crmTenantCompaniesTable,
  crmCompanyPeopleTable,
  crmTenantCompanyContactsTable,
  crmDealPeopleTable,
  crmDealCompaniesTable,
} from "@workspace/db";

const router: IRouter = Router();

const personRoles = [
  "consumidor_final","proprietario","contratante","comprador","contato_comercial","decisor",
  "responsavel_financeiro","indicador","arquiteto","engenheiro","representante","instalador","parceiro","outro",
] as const;
const companyRoles = [
  "contratante","construtora","incorporadora","imobiliaria","fornecedor","parceira","representante","outra",
] as const;

function tenantIdFromRequest(req: any, requested?: string) {
  if (req.user?.platformRole === "super_admin") {
    const tenantId = requested ?? req.user?.tenantId;
    if (!tenantId) throw Object.assign(new Error("tenantId é obrigatório"), { status: 400 });
    return tenantId;
  }
  if (!req.user?.tenantId) throw Object.assign(new Error("Tenant não identificado"), { status: 403 });
  if (requested && requested !== req.user.tenantId) throw Object.assign(new Error("Acesso negado ao tenant"), { status: 403 });
  return req.user.tenantId as string;
}

async function assertDeal(tenantId: string, dealId: string) {
  const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
    .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId))).limit(1);
  if (!deal) throw Object.assign(new Error("Negócio não encontrado neste tenant"), { status: 404 });
}

function digits(value?: string | null) { return (value ?? "").replace(/\D/g, ""); }

router.get("/crm/people", async (req, res) => {
  try {
    // tenant-audit: reviewed tenantIdFromRequest enforces authenticated same-tenant access or explicit super_admin override.
    const tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const like = `%${q}%`;
    const rows = await db.select().from(crmPeopleMasterTable)
      .where(q ? or(
        ilike(crmPeopleMasterTable.nome, like),
        ilike(crmPeopleMasterTable.documento, `%${digits(q)}%`),
      ) : undefined)
      .orderBy(desc(crmPeopleMasterTable.updatedAt)).limit(100);
    // tenantId é validado mesmo sendo cadastro mestre; o vínculo de tenant acontece no negócio/empresa.
    return res.json({ tenantId, items: rows });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

const personSchema = z.object({
  tenantId: z.string().optional(),
  nome: z.string().trim().min(2),
  documento: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email().optional(),
  source: z.string().optional().default("manual"),
});

router.post("/crm/people", async (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    tenantIdFromRequest(req, parsed.data.tenantId);
    const documento = digits(parsed.data.documento);
    const telefone = digits(parsed.data.telefone);
    const email = parsed.data.email?.trim().toLowerCase();

    const existing = await db.select().from(crmPeopleMasterTable).where(or(
      ...(documento ? [eq(crmPeopleMasterTable.documento, documento)] : []),
      ilike(crmPeopleMasterTable.nome, parsed.data.nome.trim()),
    )).limit(20);

    const exact = existing.find((p) =>
      (documento && digits(p.documento) === documento) ||
      (email && (p.emails ?? []).some((v) => v.toLowerCase() === email)) ||
      (telefone && (p.telefones ?? []).some((v) => digits(v) === telefone))
    );
    if (exact) return res.status(200).json({ item: exact, reused: true });

    const [person] = await db.insert(crmPeopleMasterTable).values({
      nome: parsed.data.nome.trim(),
      documento: documento || null,
      telefones: parsed.data.telefone ? [parsed.data.telefone.trim()] : [],
      emails: email ? [email] : [],
      source: parsed.data.source,
      updatedAt: new Date(),
    }).returning();
    return res.status(201).json({ item: person, reused: false });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

const companySchema = z.object({
  tenantId: z.string().optional(),
  cnpj: z.string().optional(),
  razaoSocial: z.string().trim().min(2),
  nomeFantasia: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
});

router.post("/crm/companies/manual", async (req, res) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    const cnpj = digits(parsed.data.cnpj);
    let company = cnpj ? (await db.select().from(crmCompaniesMasterTable).where(eq(crmCompaniesMasterTable.cnpj, cnpj)).limit(1))[0] : undefined;
    if (!company) {
      [company] = await db.insert(crmCompaniesMasterTable).values({
        cnpj: cnpj || `SEM-CNPJ-${crypto.randomUUID()}`,
        razaoSocial: parsed.data.razaoSocial,
        nomeFantasia: parsed.data.nomeFantasia || null,
        telefone: parsed.data.telefone || null,
        email: parsed.data.email || null,
        website: parsed.data.website || null,
        source: "manual",
        updatedAt: new Date(),
      }).returning();
    }
    if (!company) return res.status(500).json({ error: "Falha ao salvar empresa" });

    const [tenantCompany] = await db.insert(crmTenantCompaniesTable).values({
      tenantId, companyId: company.id, relationshipType: "lead", updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmTenantCompaniesTable.tenantId, crmTenantCompaniesTable.companyId],
      set: { status: "ativo", updatedAt: new Date() },
    }).returning();
    return res.status(201).json({ company, tenantCompany });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

const dealPersonSchema = z.object({
  tenantId: z.string().optional(),
  personId: z.string().optional(),
  person: personSchema.omit({ tenantId: true }).optional(),
  role: z.enum(personRoles).default("outro"),
  isPrimary: z.boolean().optional().default(false),
  contextualCompanyId: z.string().nullable().optional(),
  relationshipScope: z.enum(["deal_only", "persistent"]).default("deal_only"),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const dealCompanySchema = z.object({
  tenantId: z.string().optional(),
  companyId: z.string(),
  role: z.enum(companyRoles).default("outra"),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

router.get("/crm/deals/:dealId/participants", async (req, res) => {
  try {
    // tenant-audit: reviewed tenantIdFromRequest enforces authenticated same-tenant access or explicit super_admin override.
    const tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
    await assertDeal(tenantId, req.params.dealId);

    const people = await db.select({
      relationId: crmDealPeopleTable.id,
      personId: crmPeopleMasterTable.id,
      nome: crmPeopleMasterTable.nome,
      documento: crmPeopleMasterTable.documento,
      telefones: crmPeopleMasterTable.telefones,
      emails: crmPeopleMasterTable.emails,
      role: crmDealPeopleTable.role,
      isPrimary: crmDealPeopleTable.isPrimary,
      contextualCompanyId: crmDealPeopleTable.contextualCompanyId,
      relationshipScope: crmDealPeopleTable.relationshipScope,
      notes: crmDealPeopleTable.notes,
      metadata: crmDealPeopleTable.metadata,
    }).from(crmDealPeopleTable)
      .innerJoin(crmPeopleMasterTable, eq(crmPeopleMasterTable.id, crmDealPeopleTable.personId))
      .where(and(eq(crmDealPeopleTable.tenantId, tenantId), eq(crmDealPeopleTable.dealId, req.params.dealId)));

    const companies = await db.select({
      relationId: crmDealCompaniesTable.id,
      companyId: crmCompaniesMasterTable.id,
      cnpj: crmCompaniesMasterTable.cnpj,
      razaoSocial: crmCompaniesMasterTable.razaoSocial,
      nomeFantasia: crmCompaniesMasterTable.nomeFantasia,
      role: crmDealCompaniesTable.role,
      isPrimary: crmDealCompaniesTable.isPrimary,
      notes: crmDealCompaniesTable.notes,
    }).from(crmDealCompaniesTable)
      .innerJoin(crmCompaniesMasterTable, eq(crmCompaniesMasterTable.id, crmDealCompaniesTable.companyId))
      .where(and(eq(crmDealCompaniesTable.tenantId, tenantId), eq(crmDealCompaniesTable.dealId, req.params.dealId)));

    return res.json({ people, companies });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.post("/crm/deals/:dealId/people", async (req, res) => {
  const parsed = dealPersonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(tenantId, req.params.dealId);

    let personId = parsed.data.personId;
    if (!personId && parsed.data.person) {
      const p = parsed.data.person;
      const documento = digits(p.documento);
      const [person] = await db.insert(crmPeopleMasterTable).values({
        nome: p.nome.trim(),
        documento: documento || null,
        telefones: p.telefone ? [p.telefone.trim()] : [],
        emails: p.email ? [p.email.trim().toLowerCase()] : [],
        source: p.source ?? "manual",
        updatedAt: new Date(),
      }).returning({ id: crmPeopleMasterTable.id });
      personId = person?.id;
    }
    if (!personId) return res.status(422).json({ error: "Selecione ou cadastre uma pessoa." });

    const [link] = await db.insert(crmDealPeopleTable).values({
      tenantId,
      dealId: req.params.dealId,
      personId,
      role: parsed.data.role,
      isPrimary: parsed.data.isPrimary,
      contextualCompanyId: parsed.data.contextualCompanyId ?? null,
      relationshipScope: parsed.data.relationshipScope,
      notes: parsed.data.notes ?? null,
      metadata: parsed.data.metadata ?? {},
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmDealPeopleTable.dealId, crmDealPeopleTable.personId],
      set: {
        role: parsed.data.role,
        isPrimary: parsed.data.isPrimary,
        contextualCompanyId: parsed.data.contextualCompanyId ?? null,
        relationshipScope: parsed.data.relationshipScope,
        notes: parsed.data.notes ?? null,
        metadata: parsed.data.metadata ?? {},
        updatedAt: new Date(),
      },
    }).returning();

    if (parsed.data.relationshipScope === "persistent" && parsed.data.contextualCompanyId) {
      const [tc] = await db.select().from(crmTenantCompaniesTable).where(and(
        eq(crmTenantCompaniesTable.tenantId, tenantId),
        eq(crmTenantCompaniesTable.companyId, parsed.data.contextualCompanyId),
      )).limit(1);
      if (tc) {
        await db.insert(crmCompanyPeopleTable).values({
          companyId: parsed.data.contextualCompanyId,
          personId,
          source: "manual",
          updatedAt: new Date(),
        }).onConflictDoNothing();
        await db.insert(crmTenantCompanyContactsTable).values({
          tenantId,
          tenantCompanyId: tc.id,
          personId,
          roles: parsed.data.role === "decisor" ? ["decisor"] : parsed.data.role === "contato_comercial" ? ["comercial"] : ["outro"],
          isPrimary: parsed.data.isPrimary,
          verifiedAt: new Date(),
          metadata: { linkedFromDealId: req.params.dealId },
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [crmTenantCompanyContactsTable.tenantCompanyId, crmTenantCompanyContactsTable.personId],
          set: { isPrimary: parsed.data.isPrimary, verifiedAt: new Date(), updatedAt: new Date() },
        });
      }
    }

    return res.status(201).json(link);
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.post("/crm/deals/:dealId/companies", async (req, res) => {
  const parsed = dealCompanySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(tenantId, req.params.dealId);
    const [tenantCompany] = await db.select().from(crmTenantCompaniesTable).where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, parsed.data.companyId),
    )).limit(1);
    if (!tenantCompany) return res.status(422).json({ error: "Empresa não está vinculada a este tenant." });

    const [link] = await db.insert(crmDealCompaniesTable).values({
      tenantId,
      dealId: req.params.dealId,
      companyId: parsed.data.companyId,
      role: parsed.data.role,
      isPrimary: parsed.data.isPrimary,
      notes: parsed.data.notes ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmDealCompaniesTable.dealId, crmDealCompaniesTable.companyId],
      set: { role: parsed.data.role, isPrimary: parsed.data.isPrimary, notes: parsed.data.notes ?? null, updatedAt: new Date() },
    }).returning();
    return res.status(201).json(link);
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.delete("/crm/deals/:dealId/people/:relationId", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    await assertDeal(tenantId, req.params.dealId);
    await db.delete(crmDealPeopleTable).where(and(
      eq(crmDealPeopleTable.id, req.params.relationId),
      eq(crmDealPeopleTable.tenantId, tenantId),
      eq(crmDealPeopleTable.dealId, req.params.dealId),
    ));
    return res.status(204).end();
  } catch (error: any) { return res.status(error.status ?? 500).json({ error: error.message }); }
});

router.delete("/crm/deals/:dealId/companies/:relationId", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    await assertDeal(tenantId, req.params.dealId);
    await db.delete(crmDealCompaniesTable).where(and(
      eq(crmDealCompaniesTable.id, req.params.relationId),
      eq(crmDealCompaniesTable.tenantId, tenantId),
      eq(crmDealCompaniesTable.dealId, req.params.dealId),
    ));
    return res.status(204).end();
  } catch (error: any) { return res.status(error.status ?? 500).json({ error: error.message }); }
});

export default router;
