import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { buildUserFunctionFilter } from "../middlewares/auth.js";
import {
  db,
  dealsTable,
  leadsTable,
  crmPeopleMasterTable,
  crmCompaniesMasterTable,
  crmTenantCompaniesTable,
  crmCompanyPeopleTable,
  crmTenantCompanyContactsTable,
  crmDealPeopleTable,
  crmDealCompaniesTable,
} from "@workspace/db";

const router: IRouter = Router();

function appendRelationshipEvent(metadata: Record<string, unknown> | null | undefined, action: "linked" | "updated" | "unlinked", actorId?: string | null) {
  const previous = metadata ?? {};
  const history = Array.isArray(previous.relationshipHistory) ? previous.relationshipHistory : [];
  return {
    ...previous,
    inactive: action === "unlinked",
    relationshipHistory: [...history, { action, at: new Date().toISOString(), actorId: actorId ?? null }],
  };
}



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

async function assertDeal(req: any, tenantId: string, dealId: string) {
  const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
    .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, dealsTable))).limit(1);
  if (!deal) throw Object.assign(new Error("Negócio não encontrado neste tenant"), { status: 404 });
}

function digits(value?: string | null) { return (value ?? "").replace(/\D/g, ""); }

router.get("/crm/people", async (req, res) => {
  try {
    // tenant-audit: reviewed tenantIdFromRequest enforces authenticated same-tenant access or explicit super_admin override.
    const tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const like = `%${q}%`;
    const dealPersonIds = await db.select({ personId: crmDealPeopleTable.personId }).from(crmDealPeopleTable)
      .innerJoin(dealsTable, eq(dealsTable.id, crmDealPeopleTable.dealId))
      .where(and(eq(crmDealPeopleTable.tenantId, tenantId), eq(dealsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, dealsTable)));
    const visibleLeads = await db.select({ id: leadsTable.id }).from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)));
    const visibleLeadIds = visibleLeads.map((lead) => lead.id);
    const companyContactIds = await db.select({ personId: crmTenantCompanyContactsTable.personId }).from(crmTenantCompanyContactsTable)
      .innerJoin(crmTenantCompaniesTable, eq(crmTenantCompaniesTable.id, crmTenantCompanyContactsTable.tenantCompanyId))
      .where(and(
        eq(crmTenantCompanyContactsTable.tenantId, tenantId),
        eq(crmTenantCompaniesTable.tenantId, tenantId),
        or(
          isNull(crmTenantCompaniesTable.leadId),
          ...(visibleLeadIds.length ? [inArray(crmTenantCompaniesTable.leadId, visibleLeadIds)] : []),
        ),
      ));
    const visiblePersonIds = [...new Set([...dealPersonIds, ...companyContactIds].map((row) => row.personId))];
    if (visiblePersonIds.length === 0) return res.json({ tenantId, items: [] });

    const visibility = inArray(crmPeopleMasterTable.id, visiblePersonIds);
    const search = q ? or(
      ilike(crmPeopleMasterTable.nome, like),
      ilike(crmPeopleMasterTable.documento, `%${digits(q)}%`),
    ) : undefined;
    const rows = await db.select().from(crmPeopleMasterTable)
      .where(search ? and(visibility, search) : visibility)
      .orderBy(desc(crmPeopleMasterTable.updatedAt)).limit(100);
    return res.json({ tenantId, items: rows });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

const personSchema = z.object({
  tenantId: z.string().optional(),
  nome: z.string().trim().min(2),
  documento: z.string().optional(),
  dataNascimento: z.iso.date().optional(),
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

    const exact = existing.find((p) => documento && digits(p.documento) === documento);
    if (exact) {
      // A master record can be shared across tenants; do not return its personal data
      // to a tenant without an existing authorized relationship.
      const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
      const linkedDeal = await db.select({ id: crmDealPeopleTable.id })
        .from(crmDealPeopleTable).where(and(
          eq(crmDealPeopleTable.tenantId, tenantId),
          eq(crmDealPeopleTable.personId, exact.id),
        )).limit(1);
      const linkedContact = await db.select({ id: crmTenantCompanyContactsTable.id })
        .from(crmTenantCompanyContactsTable).where(and(
          eq(crmTenantCompanyContactsTable.tenantId, tenantId),
          eq(crmTenantCompanyContactsTable.personId, exact.id),
        )).limit(1);
      if (!linkedDeal.length && !linkedContact.length) {
        return res.status(409).json({
          error: "Documento já cadastrado. Solicite a vinculação autorizada antes de reutilizá-lo.",
        });
      }
      return res.status(200).json({ item: exact, reused: true });
    }

    // Telephone and e-mail are shared between relatives and company contacts.
    // Never merge two distinct people based solely on these contact channels.
    // A candidate matching by name + channel must be reviewed before linking.
    const candidates = existing.filter((p) =>
      p.nome.trim().toLocaleLowerCase("pt-BR") === parsed.data.nome.trim().toLocaleLowerCase("pt-BR") &&
      ((email && (p.emails ?? []).some((v) => v.toLowerCase() === email)) ||
       (telefone && (p.telefones ?? []).some((v) => digits(v) === telefone)))
    );
    if (candidates.length) {
      return res.status(409).json({
        error: "Possível pessoa já cadastrada. Selecione o cadastro existente para evitar duplicação.",
        // Do not disclose global master IDs in duplicate-candidate errors.
      });
    }

    const [person] = await db.insert(crmPeopleMasterTable).values({
      nome: parsed.data.nome.trim(),
      documento: documento || null,
      dataNascimento: parsed.data.dataNascimento ?? null,
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
    await assertDeal(req, tenantId, req.params.dealId);

    const people = await db.select({
      relationId: crmDealPeopleTable.id,
      personId: crmPeopleMasterTable.id,
      nome: crmPeopleMasterTable.nome,
      documento: crmPeopleMasterTable.documento,
      dataNascimento: crmPeopleMasterTable.dataNascimento,
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
      metadata: crmDealCompaniesTable.metadata,
    }).from(crmDealCompaniesTable)
      .innerJoin(crmCompaniesMasterTable, eq(crmCompaniesMasterTable.id, crmDealCompaniesTable.companyId))
      .where(and(eq(crmDealCompaniesTable.tenantId, tenantId), eq(crmDealCompaniesTable.dealId, req.params.dealId)));

    return res.json({ people: people.filter((item) => item.metadata?.inactive !== true), companies: companies.filter((item) => item.metadata?.inactive !== true) });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

const personalDataSchema = z.object({
  tenantId: z.string().optional(),
  nome: z.string().trim().min(2),
  documento: z.string().optional(),
  telefone: z.string().optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  dataNascimento: z.union([z.iso.date(), z.literal("")]).optional(),
});

router.patch("/crm/deals/:dealId/people/:personId/profile", async (req, res) => {
  const parsed = personalDataSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(req, tenantId, req.params.dealId);
    const [linked] = await db.select({ id: crmDealPeopleTable.id, metadata: crmDealPeopleTable.metadata })
      .from(crmDealPeopleTable)
      .where(and(eq(crmDealPeopleTable.tenantId, tenantId),
        eq(crmDealPeopleTable.dealId, req.params.dealId),
        eq(crmDealPeopleTable.personId, req.params.personId))).limit(1);
    if (!linked) return res.status(404).json({ error: "Pessoa não vinculada a este negócio." });
    if (linked.metadata?.inactive === true) return res.status(409).json({ error: "Vínculo inativo. Reative antes de editar o perfil." });
    // A master person's profile is global. Editing it from one tenant would change
    // personal data visible to another tenant, so require a separate ownership workflow.
    const foreignDeal = await db.select({ id: crmDealPeopleTable.id }).from(crmDealPeopleTable)
      .where(and(eq(crmDealPeopleTable.personId, req.params.personId),
        sql`${crmDealPeopleTable.tenantId} <> ${tenantId}`)).limit(1);
    const foreignContact = await db.select({ id: crmTenantCompanyContactsTable.id }).from(crmTenantCompanyContactsTable)
      .where(and(eq(crmTenantCompanyContactsTable.personId, req.params.personId),
        sql`${crmTenantCompanyContactsTable.tenantId} <> ${tenantId}`)).limit(1);
    if (foreignDeal.length || foreignContact.length) {
      return res.status(409).json({ error: "Cadastro compartilhado com outra empresa. Edição global bloqueada para proteger os dados." });
    }
    const documento = digits(parsed.data.documento);
    if (documento) {
      const matches = await db.select({ id: crmPeopleMasterTable.id })
        .from(crmPeopleMasterTable).where(eq(crmPeopleMasterTable.documento, documento)).limit(1);
      if (matches.length && matches[0].id !== req.params.personId)
        return res.status(409).json({ error: "Documento já pertence a outra pessoa." });
    }
    const [current] = await db.select().from(crmPeopleMasterTable)
      .where(eq(crmPeopleMasterTable.id, req.params.personId)).limit(1);
    if (!current) return res.status(404).json({ error: "Cadastro da pessoa não encontrado." });
    const newPhone = parsed.data.telefone?.trim();
    const newEmail = parsed.data.email?.trim().toLowerCase();
    const [updated] = await db.update(crmPeopleMasterTable).set({
      nome: parsed.data.nome,
      documento: parsed.data.documento === undefined ? current.documento : documento || null,
      telefones: parsed.data.telefone === undefined ? current.telefones :
        newPhone ? [newPhone, ...(current.telefones ?? []).filter(
          (phone) => digits(phone) !== digits(newPhone)
        )] : current.telefones,
      emails: parsed.data.email === undefined ? current.emails :
        newEmail ? [newEmail, ...(current.emails ?? []).filter(
          (email) => email.toLowerCase() !== newEmail
        )] : current.emails,
      dataNascimento: parsed.data.dataNascimento === undefined ? current.dataNascimento : parsed.data.dataNascimento || null,
      updatedAt: new Date(),
    }).where(eq(crmPeopleMasterTable.id, req.params.personId)).returning();
    return res.json({ item: updated });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.post("/crm/deals/:dealId/people", async (req, res) => {
  const parsed = dealPersonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(req, tenantId, req.params.dealId);

    if (parsed.data.contextualCompanyId) {
      const [tenantCompany] = await db.select({ id: crmTenantCompaniesTable.id })
        .from(crmTenantCompaniesTable).where(and(
          eq(crmTenantCompaniesTable.tenantId, tenantId),
          eq(crmTenantCompaniesTable.companyId, parsed.data.contextualCompanyId),
        )).limit(1);
      if (!tenantCompany) return res.status(422).json({ error: "Empresa contextual não vinculada a este tenant." });
    }

    let personId = parsed.data.personId;
    if (!personId && parsed.data.person) {
      const p = parsed.data.person;
      const documento = digits(p.documento);
      if (documento) {
        const [existing] = await db.select({ id: crmPeopleMasterTable.id })
          .from(crmPeopleMasterTable).where(eq(crmPeopleMasterTable.documento, documento)).limit(1);
        if (existing) {
          return res.status(409).json({
            error: "Documento já cadastrado. Selecione a pessoa existente para vinculá-la ao negócio.",
        // Do not disclose global master IDs in duplicate-candidate errors.
          });
        }
      }
      const telefone = digits(p.telefone);
      const email = p.email?.trim().toLowerCase();
      const candidates = await db.select({
        id: crmPeopleMasterTable.id,
        nome: crmPeopleMasterTable.nome,
        telefones: crmPeopleMasterTable.telefones,
        emails: crmPeopleMasterTable.emails,
      }).from(crmPeopleMasterTable).where(ilike(crmPeopleMasterTable.nome, p.nome.trim())).limit(30);
      const possible = candidates.filter((person) =>
        (telefone && (person.telefones ?? []).some((v) => digits(v) === telefone)) ||
        (email && (person.emails ?? []).some((v) => v.toLowerCase() === email))
      );
      if (possible.length) {
        return res.status(409).json({
          error: "Possível pessoa já cadastrada. Selecione o cadastro existente antes de vincular.",
        // Do not disclose global master IDs in duplicate-candidate errors.
        });
      }
      const [person] = await db.insert(crmPeopleMasterTable).values({
        nome: p.nome.trim(),
        documento: documento || null,
        dataNascimento: p.dataNascimento ?? null,
        telefones: p.telefone ? [p.telefone.trim()] : [],
        emails: email ? [email] : [],
        source: p.source ?? "manual",
        updatedAt: new Date(),
      }).returning({ id: crmPeopleMasterTable.id });
      personId = person?.id;
    }
    if (!personId) return res.status(422).json({ error: "Selecione ou cadastre uma pessoa." });

    const link = await db.transaction(async (tx) => {
      // Serialize primary-contact changes per tenant/deal, preventing concurrent primary flags.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
      if (parsed.data.isPrimary) {
        await tx.update(crmDealPeopleTable).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(crmDealPeopleTable.tenantId, tenantId), eq(crmDealPeopleTable.dealId, req.params.dealId)));
    }

      const [previousLink] = await tx.select({ metadata: crmDealPeopleTable.metadata })
        .from(crmDealPeopleTable).where(and(eq(crmDealPeopleTable.tenantId, tenantId),
          eq(crmDealPeopleTable.dealId, req.params.dealId), eq(crmDealPeopleTable.personId, personId))).limit(1);
      const relationshipMetadata = appendRelationshipEvent(
        { ...(previousLink?.metadata ?? {}), ...(parsed.data.metadata ?? {}), relationshipHistory: previousLink?.metadata?.relationshipHistory }, previousLink ? (previousLink.metadata?.inactive === true ? "linked" : "updated") : "linked", req.user?.id,
      );
      const [link] = await tx.insert(crmDealPeopleTable).values({
      tenantId,
      dealId: req.params.dealId,
      personId,
      role: parsed.data.role,
      isPrimary: parsed.data.isPrimary,
      contextualCompanyId: parsed.data.contextualCompanyId ?? null,
      relationshipScope: parsed.data.relationshipScope,
      notes: parsed.data.notes ?? null,
      metadata: relationshipMetadata,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmDealPeopleTable.dealId, crmDealPeopleTable.personId],
      set: {
        role: parsed.data.role,
        isPrimary: parsed.data.isPrimary,
        contextualCompanyId: parsed.data.contextualCompanyId ?? null,
        relationshipScope: parsed.data.relationshipScope,
        notes: parsed.data.notes ?? null,
        metadata: relationshipMetadata,
        updatedAt: new Date(),
      },
    }).returning();
      return link;
    });

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
    await assertDeal(req, tenantId, req.params.dealId);
    const [tenantCompany] = await db.select().from(crmTenantCompaniesTable).where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, parsed.data.companyId),
    )).limit(1);
    if (!tenantCompany) return res.status(422).json({ error: "Empresa não está vinculada a este tenant." });

    const [previousCompanyLink] = await db.select({ metadata: crmDealCompaniesTable.metadata })
      .from(crmDealCompaniesTable).where(and(eq(crmDealCompaniesTable.tenantId, tenantId),
        eq(crmDealCompaniesTable.dealId, req.params.dealId),
        eq(crmDealCompaniesTable.companyId, parsed.data.companyId))).limit(1);
    const companyMetadata = appendRelationshipEvent(previousCompanyLink?.metadata,
      previousCompanyLink ? (previousCompanyLink.metadata?.inactive === true ? "linked" : "updated") : "linked", req.user?.id);
    const [link] = await db.insert(crmDealCompaniesTable).values({
      tenantId,
      dealId: req.params.dealId,
      companyId: parsed.data.companyId,
      role: parsed.data.role,
      isPrimary: parsed.data.isPrimary,
      notes: parsed.data.notes ?? null,
      metadata: companyMetadata,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmDealCompaniesTable.dealId, crmDealCompaniesTable.companyId],
      set: { role: parsed.data.role, isPrimary: parsed.data.isPrimary, notes: parsed.data.notes ?? null, metadata: companyMetadata, updatedAt: new Date() },
    }).returning();
    return res.status(201).json(link);
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

// Soft-unlink: keep the relationship row and its history for audit and future reactivation.
router.delete("/crm/deals/:dealId/people/:relationId", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    await assertDeal(req, tenantId, req.params.dealId);
    const [relation] = await db.select().from(crmDealPeopleTable).where(and(
      eq(crmDealPeopleTable.id, req.params.relationId),
      eq(crmDealPeopleTable.tenantId, tenantId),
      eq(crmDealPeopleTable.dealId, req.params.dealId),
    )).limit(1);
    if (!relation) return res.status(404).json({ error: "Vínculo não encontrado." });
    if (relation.metadata?.inactive === true) return res.status(204).end();
    await db.update(crmDealPeopleTable).set({
      isPrimary: false,
      metadata: appendRelationshipEvent(relation.metadata, "unlinked", req.user?.id),
      updatedAt: new Date(),
    }).where(eq(crmDealPeopleTable.id, relation.id));
    return res.status(204).end();
  } catch (error: any) { return res.status(error.status ?? 500).json({ error: error.message }); }
});

router.delete("/crm/deals/:dealId/companies/:relationId", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    await assertDeal(req, tenantId, req.params.dealId);
    const [relation] = await db.select().from(crmDealCompaniesTable).where(and(
      eq(crmDealCompaniesTable.id, req.params.relationId),
      eq(crmDealCompaniesTable.tenantId, tenantId),
      eq(crmDealCompaniesTable.dealId, req.params.dealId),
    )).limit(1);
    if (!relation) return res.status(404).json({ error: "Vínculo não encontrado." });
    if (relation.metadata?.inactive === true) return res.status(204).end();
    await db.update(crmDealCompaniesTable).set({
      isPrimary: false,
      metadata: appendRelationshipEvent(relation.metadata, "unlinked", req.user?.id),
      updatedAt: new Date(),
    }).where(eq(crmDealCompaniesTable.id, relation.id));
    return res.status(204).end();
  } catch (error: any) { return res.status(error.status ?? 500).json({ error: error.message }); }
});

export default router;
