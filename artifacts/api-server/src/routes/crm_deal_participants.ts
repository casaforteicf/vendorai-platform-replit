import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { buildUserFunctionFilter } from "../middlewares/auth.js";
import { fingerprintRegistrationPayload, parseRegistrationRequestId } from "../lib/crm-lead-idempotency.js";
import { appendRelationshipEvent } from "../lib/crm-relationship-history.js";
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
function canManageCrmCommissions(req: any): boolean {
  return req.user?.platformRole === "super_admin" ||
    req.user?.platformRole === "tenant_admin";
}

function safeParticipantMetadata(metadata: any, canViewCommission: boolean) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  if (canViewCommission) return metadata;
  const { commission: _privateCommission, commissionHistory: _privateHistory, ...visible } = metadata;
  return visible;
}


router.get("/crm/people", async (req, res) => {
  try {
    // tenant-audit: reviewed tenantIdFromRequest enforces authenticated same-tenant access or explicit super_admin override.
    const tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const like = `%${q}%`;
    const dealPersonIds = await db.select({ personId: crmDealPeopleTable.personId }).from(crmDealPeopleTable)
      .innerJoin(dealsTable, eq(dealsTable.id, crmDealPeopleTable.dealId))
      .where(and(eq(crmDealPeopleTable.tenantId, tenantId), eq(dealsTable.tenantId, tenantId),
        sql`COALESCE(${crmDealPeopleTable.metadata}->>'inactive', 'false') <> 'true'`,
        ...buildUserFunctionFilter(req, dealsTable)));
    const visibleLeads = await db.select({ id: leadsTable.id }).from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)));
    const visibleLeadIds = visibleLeads.map((lead) => lead.id);
    const companyContactIds = await db.select({ personId: crmTenantCompanyContactsTable.personId }).from(crmTenantCompanyContactsTable)
      .innerJoin(crmTenantCompaniesTable, eq(crmTenantCompaniesTable.id, crmTenantCompanyContactsTable.tenantCompanyId))
      .where(and(
        eq(crmTenantCompanyContactsTable.tenantId, tenantId),
        eq(crmTenantCompaniesTable.tenantId, tenantId),
        ...(visibleLeadIds.length ? [inArray(crmTenantCompaniesTable.leadId, visibleLeadIds)] : [sql`false`]),
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
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
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
      const linkedDeal = await db.select({ id: crmDealPeopleTable.id })
        .from(crmDealPeopleTable)
        .innerJoin(dealsTable, eq(dealsTable.id, crmDealPeopleTable.dealId))
        .where(and(
          eq(crmDealPeopleTable.tenantId, tenantId),
          eq(dealsTable.tenantId, tenantId),
          eq(crmDealPeopleTable.personId, exact.id),
          sql`COALESCE(${crmDealPeopleTable.metadata}->>'inactive', 'false') <> 'true'`,
          ...buildUserFunctionFilter(req, dealsTable),
        )).limit(1);
      const linkedContact = await db.select({ id: crmTenantCompanyContactsTable.id })
        .from(crmTenantCompanyContactsTable)
        .innerJoin(crmTenantCompaniesTable, eq(crmTenantCompaniesTable.id, crmTenantCompanyContactsTable.tenantCompanyId))
        .where(and(
          eq(crmTenantCompanyContactsTable.tenantId, tenantId),
          eq(crmTenantCompaniesTable.tenantId, tenantId),
          eq(crmTenantCompanyContactsTable.personId, exact.id),
          inArray(crmTenantCompaniesTable.leadId,
            db.select({ id: leadsTable.id }).from(leadsTable)
              .where(and(eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)))),
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
      metadata: { createdTenantId: tenantId },
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
    const { company, tenantCompany } = await db.transaction(async (tx) => {
    const cnpj = digits(parsed.data.cnpj);
      if (cnpj) {
        // Global master may be linked by different tenants: serialize by CNPJ.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('crm-company-master'), hashtext(${cnpj}))`);
      }
    let company = cnpj ? (await tx.select().from(crmCompaniesMasterTable).where(eq(crmCompaniesMasterTable.cnpj, cnpj)).limit(1))[0] : undefined;
    if (!company) {
      [company] = await tx.insert(crmCompaniesMasterTable).values({
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
    if (!company) throw Object.assign(new Error("Falha ao salvar empresa"), { status: 500 });

    const [tenantCompany] = await tx.insert(crmTenantCompaniesTable).values({
      tenantId, companyId: company.id, relationshipType: "lead", updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmTenantCompaniesTable.tenantId, crmTenantCompaniesTable.companyId],
      set: { status: "ativo", updatedAt: new Date() },
    }).returning();
      return { company, tenantCompany };
    });
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

    return res.json({
      people: people.filter((item) => item.metadata?.inactive !== true).map((item) => ({
        ...item, metadata: safeParticipantMetadata(item.metadata, canManageCrmCommissions(req)),
      })),
      companies: companies.filter((item) => item.metadata?.inactive !== true).map((item) => ({
        ...item, metadata: safeParticipantMetadata(item.metadata, canManageCrmCommissions(req)),
      })),
    });
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

// Atomic editing of an EXISTING participant: the global profile and deal link commit together.
const participantUpdateSchema = dealPersonSchema.omit({ personId: true, person: true }).extend({
  profile: personalDataSchema.omit({ tenantId: true }),
});
router.patch("/crm/deals/:dealId/people/:personId", async (req, res) => {
  const parsed = participantUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    if (["commission", "commissionHistory"].some((key) =>
        Object.prototype.hasOwnProperty.call(parsed.data.metadata ?? {}, key))) {
      return res.status(403).json({ error: "Comissão restrita a administradores." });
    }
    await assertDeal(req, tenantId, req.params.dealId);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
      const [linked] = await tx.select().from(crmDealPeopleTable).where(and(
        eq(crmDealPeopleTable.tenantId, tenantId),
        eq(crmDealPeopleTable.dealId, req.params.dealId),
        eq(crmDealPeopleTable.personId, req.params.personId),
      )).limit(1);
      if (!linked || linked.metadata?.inactive === true)
        throw Object.assign(new Error("Vínculo ativo não encontrado. Reative a pessoa antes de editar."), { status: 409 });
      if (parsed.data.contextualCompanyId) {
        const [company] = await tx.select({ id: crmTenantCompaniesTable.id }).from(crmTenantCompaniesTable)
          .where(and(eq(crmTenantCompaniesTable.tenantId, tenantId),
            eq(crmTenantCompaniesTable.companyId, parsed.data.contextualCompanyId))).limit(1);
        if (!company) throw Object.assign(new Error("Empresa contextual inválida neste tenant."), { status: 422 });
      }
      // Global master profile cannot be edited from a tenant sharing this person with another tenant.
      const foreignDeal = await tx.select({ id: crmDealPeopleTable.id }).from(crmDealPeopleTable)
        .where(and(eq(crmDealPeopleTable.personId, req.params.personId),
          sql`${crmDealPeopleTable.tenantId} <> ${tenantId}`)).limit(1);
      const foreignContact = await tx.select({ id: crmTenantCompanyContactsTable.id }).from(crmTenantCompanyContactsTable)
        .where(and(eq(crmTenantCompanyContactsTable.personId, req.params.personId),
          sql`${crmTenantCompanyContactsTable.tenantId} <> ${tenantId}`)).limit(1);
      if (foreignDeal.length || foreignContact.length)
        throw Object.assign(new Error("Cadastro compartilhado com outro tenant. Edição global bloqueada."), { status: 409 });
      const [current] = await tx.select().from(crmPeopleMasterTable)
        .where(eq(crmPeopleMasterTable.id, req.params.personId)).limit(1);
      if (!current) throw Object.assign(new Error("Pessoa não encontrada."), { status: 404 });
      const documento = digits(parsed.data.profile.documento);
      if (documento) {
        const matches = await tx.select({ id: crmPeopleMasterTable.id }).from(crmPeopleMasterTable)
          .where(eq(crmPeopleMasterTable.documento, documento)).limit(1);
        if (matches.length && matches[0].id !== current.id)
          throw Object.assign(new Error("Documento já pertence a outra pessoa."), { status: 409 });
      }
      const newPhone = parsed.data.profile.telefone?.trim();
      const newEmail = parsed.data.profile.email?.trim().toLowerCase();
      const [person] = await tx.update(crmPeopleMasterTable).set({
        nome: parsed.data.profile.nome,
        documento: parsed.data.profile.documento === undefined ? current.documento : documento || null,
        telefones: parsed.data.profile.telefone === undefined ? current.telefones :
          newPhone ? [newPhone, ...(current.telefones ?? []).filter(v => digits(v) !== digits(newPhone))] : current.telefones,
        emails: parsed.data.profile.email === undefined ? current.emails :
          newEmail ? [newEmail, ...(current.emails ?? []).filter(v => v.toLowerCase() !== newEmail)] : current.emails,
        dataNascimento: parsed.data.profile.dataNascimento === undefined ? current.dataNascimento : parsed.data.profile.dataNascimento || null,
        updatedAt: new Date(),
      }).where(eq(crmPeopleMasterTable.id, current.id)).returning();
      if (parsed.data.isPrimary) {
        await tx.update(crmDealPeopleTable).set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(crmDealPeopleTable.tenantId, tenantId), eq(crmDealPeopleTable.dealId, req.params.dealId)));
      }
      const safeMetadata = Object.fromEntries(Object.entries(parsed.data.metadata ?? {})
        .filter(([key]) => !["relationshipHistory", "inactive", "unlinkedAt", "unlinkedBy", "createdTenantId", "legacyRelationship"].includes(key)));
      const metadata = appendRelationshipEvent({ ...(linked.metadata ?? {}), ...safeMetadata,
        legacyRelationship: !Array.isArray(linked.metadata?.relationshipHistory) }, "updated", req.user?.id);
      const [link] = await tx.update(crmDealPeopleTable).set({
        role: parsed.data.role,
        isPrimary: parsed.data.isPrimary,
        contextualCompanyId: parsed.data.contextualCompanyId ?? null,
        relationshipScope: parsed.data.relationshipScope,
        notes: parsed.data.notes ?? null,
        metadata,
        updatedAt: new Date(),
      }).where(eq(crmDealPeopleTable.id, linked.id)).returning();
      return { person, link };
    });
    return res.json({ ...result, link: { ...result.link, metadata: safeParticipantMetadata(result.link.metadata, canManageCrmCommissions(req)) } });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

// CRM-07: alteração financeira separada da edição de dados cadastrais.
const commissionPatchSchema = z.object({
  tenantId: z.string().optional(),
  enabled: z.boolean(),
  kind: z.enum(["percent", "fixed"]).default("percent"),
  value: z.number().finite().min(0).max(100000000).nullable(),
});
router.patch("/crm/deals/:dealId/people/:personId/commission", async (req, res) => {
  const parsed = commissionPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  if (!canManageCrmCommissions(req)) return res.status(403).json({ error: "Comissão restrita a administradores." });
  if (parsed.data.enabled && (parsed.data.value === null ||
      (parsed.data.kind === "percent" && parsed.data.value > 100))) {
    return res.status(422).json({ error: "Informe comissão válida (percentual entre 0 e 100)." });
  }
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(req, tenantId, req.params.dealId);
    const link = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(crmDealPeopleTable).where(and(
        eq(crmDealPeopleTable.tenantId, tenantId),
        eq(crmDealPeopleTable.dealId, req.params.dealId),
        eq(crmDealPeopleTable.personId, req.params.personId),
      )).for("update").limit(1);
      if (!existing || existing.metadata?.inactive === true)
        throw Object.assign(new Error("Vínculo ativo não encontrado."), { status: 404 });
      const current = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
      const previous = (current as Record<string, unknown>).commission ?? null;
      const commission = parsed.data.enabled
        ? { enabled: true, kind: parsed.data.kind, value: parsed.data.value, status: "prevista" }
        : { enabled: false, kind: parsed.data.kind, value: null };
      const history = Array.isArray((current as any).commissionHistory)
        ? (current as any).commissionHistory : [];
      const metadata = { ...current, commission,
        commissionHistory: [...history, { from: previous, to: commission,
          actorId: req.user?.sub ?? req.user?.id ?? null, changedAt: new Date().toISOString() }] };
      const [updated] = await tx.update(crmDealPeopleTable).set({ metadata, updatedAt: new Date() })
        .where(eq(crmDealPeopleTable.id, existing.id)).returning();
      return updated;
    });
    return res.json({ relationId: link.id, commission: (link.metadata as any)?.commission });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.patch("/crm/deals/:dealId/people/:personId/profile", async (req, res) => {
  const parsed = personalDataSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(req, tenantId, req.params.dealId);
    const updated = await db.transaction(async (tx) => {
      // Uses the same deal lock as link/unlink to avoid editing an already detached relation.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
    const [linked] = await tx.select({ id: crmDealPeopleTable.id, metadata: crmDealPeopleTable.metadata })
      .from(crmDealPeopleTable)
      .where(and(eq(crmDealPeopleTable.tenantId, tenantId),
        eq(crmDealPeopleTable.dealId, req.params.dealId),
        eq(crmDealPeopleTable.personId, req.params.personId))).limit(1);
    if (!linked) throw Object.assign(new Error("Pessoa não vinculada a este negócio."), { status: 404 });
    if (linked.metadata?.inactive === true) throw Object.assign(new Error("Vínculo inativo. Reative antes de editar o perfil."), { status: 409 });
    // A master person's profile is global. Editing it from one tenant would change
    // personal data visible to another tenant, so require a separate ownership workflow.
    const foreignDeal = await tx.select({ id: crmDealPeopleTable.id }).from(crmDealPeopleTable)
      .where(and(eq(crmDealPeopleTable.personId, req.params.personId),
        sql`${crmDealPeopleTable.tenantId} <> ${tenantId}`)).limit(1);
    const foreignContact = await tx.select({ id: crmTenantCompanyContactsTable.id }).from(crmTenantCompanyContactsTable)
      .where(and(eq(crmTenantCompanyContactsTable.personId, req.params.personId),
        sql`${crmTenantCompanyContactsTable.tenantId} <> ${tenantId}`)).limit(1);
    if (foreignDeal.length || foreignContact.length) {
      throw Object.assign(new Error("Cadastro compartilhado com outra empresa. Edição global bloqueada para proteger os dados."), { status: 409 });
    }
    const documento = digits(parsed.data.documento);
    if (documento) {
      const matches = await tx.select({ id: crmPeopleMasterTable.id })
        .from(crmPeopleMasterTable).where(eq(crmPeopleMasterTable.documento, documento)).limit(1);
      if (matches.length && matches[0].id !== req.params.personId)
        throw Object.assign(new Error("Documento já pertence a outra pessoa."), { status: 409 });
    }
    const [current] = await tx.select().from(crmPeopleMasterTable)
      .where(eq(crmPeopleMasterTable.id, req.params.personId)).limit(1);
    if (!current) throw Object.assign(new Error("Cadastro da pessoa não encontrado."), { status: 404 });
    const newPhone = parsed.data.telefone?.trim();
    const newEmail = parsed.data.email?.trim().toLowerCase();
    const [updated] = await tx.update(crmPeopleMasterTable).set({
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
      return updated;
    });
    return res.json({ item: updated });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

// The two consumers in a couple must be committed together (no orphan master record).
const coupleSchema = z.object({
  tenantId: z.string().optional(),
  people: z.tuple([personSchema.omit({ tenantId: true }), personSchema.omit({ tenantId: true })]),
  contextualCompanyId: z.string().nullable().optional(),
  registrationRequestId: z.string().optional(),
});
router.post("/crm/deals/:dealId/couple", async (req, res) => {
  const parsed = coupleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    await assertDeal(req, tenantId, req.params.dealId);
    const registrationRequestId = parseRegistrationRequestId(parsed.data.registrationRequestId);
    const registrationPayloadHash = registrationRequestId
      ? fingerprintRegistrationPayload({ people: parsed.data.people,
          contextualCompanyId: parsed.data.contextualCompanyId ?? null }) : null;
    const [first, second] = parsed.data.people;
    const firstDoc = digits(first.documento);
    const secondDoc = digits(second.documento);
    if (firstDoc && secondDoc && firstDoc === secondDoc)
      return res.status(422).json({ error: "Os dois clientes devem possuir documentos distintos." });
    const firstEmail = first.email?.trim().toLowerCase();
    const secondEmail = second.email?.trim().toLowerCase();
    const firstPhone = digits(first.telefone);
    const secondPhone = digits(second.telefone);
    if (firstEmail && secondEmail && firstEmail === secondEmail && first.nome.trim().toLowerCase() === second.nome.trim().toLowerCase())
      return res.status(422).json({ error: "Os dois clientes devem ser pessoas distintas; e-mail e nome idênticos." });
    if (firstPhone && secondPhone && firstPhone === secondPhone && first.nome.trim().toLowerCase() === second.nome.trim().toLowerCase())
      return res.status(422).json({ error: "Os dois clientes devem ser pessoas distintas; telefone e nome idênticos." });
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
      if (registrationRequestId) {
        const previous = await tx.select().from(crmDealPeopleTable).where(and(
          eq(crmDealPeopleTable.tenantId, tenantId),
          eq(crmDealPeopleTable.dealId, req.params.dealId),
          sql`${crmDealPeopleTable.metadata}->>'registrationRequestId' = ${registrationRequestId}`,
        ));
        if (previous.length) {
          if (previous.length !== 2 || previous.some(link =>
            link.metadata?.registrationPayloadHash !== registrationPayloadHash ||
            link.metadata?.inactive === true)) {
            throw Object.assign(new Error("Solicitação de casal já usada com dados divergentes."), { status: 409 });
          }
          return previous.sort((a, b) =>
            Number(a.metadata?.ordemClientePrincipal ?? 0) - Number(b.metadata?.ordemClientePrincipal ?? 0))
            .map(link => ({ personId: link.personId, link }));
        }
      }
      if (parsed.data.contextualCompanyId) {
        const [company] = await tx.select({ id: crmTenantCompaniesTable.id }).from(crmTenantCompaniesTable)
          .where(and(eq(crmTenantCompaniesTable.tenantId, tenantId),
            eq(crmTenantCompaniesTable.companyId, parsed.data.contextualCompanyId))).limit(1);
        if (!company) throw Object.assign(new Error("Empresa contextual não pertence ao tenant."), { status: 422 });
      }
      const people = [];
      for (const [index, person] of parsed.data.people.entries()) {
        const documento = digits(person.documento);
        const telefone = digits(person.telefone);
        const email = person.email?.trim().toLowerCase();
        if (documento) {
          const [duplicate] = await tx.select({ id: crmPeopleMasterTable.id }).from(crmPeopleMasterTable)
            .where(eq(crmPeopleMasterTable.documento, documento)).limit(1);
          if (duplicate) throw Object.assign(new Error(`Documento do Cliente ${index + 1} já cadastrado. Selecione o cadastro existente.`), { status: 409 });
        }
        const candidates = await tx.select({
          nome: crmPeopleMasterTable.nome, telefones: crmPeopleMasterTable.telefones, emails: crmPeopleMasterTable.emails,
        }).from(crmPeopleMasterTable).where(ilike(crmPeopleMasterTable.nome, person.nome.trim())).limit(30);
        if (candidates.some(candidate =>
          (telefone && (candidate.telefones ?? []).some(v => digits(v) === telefone)) ||
          (email && (candidate.emails ?? []).some(v => v.toLowerCase() === email))))
          throw Object.assign(new Error(`Possível duplicidade no Cliente ${index + 1}. Revise o cadastro existente.`), { status: 409 });
        const [created] = await tx.insert(crmPeopleMasterTable).values({
          nome: person.nome.trim(), documento: documento || null,
          dataNascimento: person.dataNascimento ?? null,
          telefones: person.telefone ? [person.telefone.trim()] : [],
          emails: email ? [email] : [],
          source: person.source ?? "manual", metadata: { createdTenantId: tenantId },
          updatedAt: new Date(),
        }).returning({ id: crmPeopleMasterTable.id });
        const [link] = await tx.insert(crmDealPeopleTable).values({
          tenantId, dealId: req.params.dealId, personId: created.id, role: "consumidor_final",
          isPrimary: index === 0, contextualCompanyId: parsed.data.contextualCompanyId ?? null,
          relationshipScope: "deal_only",
          metadata: appendRelationshipEvent({ clientePrincipal: true, ordemClientePrincipal: index + 1, grupoCliente: "multiplo",
            ...(registrationRequestId ? { registrationRequestId, registrationPayloadHash } : {}) },
            "linked", req.user?.id),
          updatedAt: new Date(),
        }).returning();
        people.push({ personId: created.id, link });
      }
      await tx.update(crmDealPeopleTable).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(crmDealPeopleTable.tenantId, tenantId),
          eq(crmDealPeopleTable.dealId, req.params.dealId),
          sql`${crmDealPeopleTable.personId} <> ${people[0].personId}`));
      if (parsed.data.contextualCompanyId) {
        const [existingCompanyLink] = await tx.select({ metadata: crmDealCompaniesTable.metadata })
          .from(crmDealCompaniesTable).where(and(
            eq(crmDealCompaniesTable.tenantId, tenantId),
            eq(crmDealCompaniesTable.dealId, req.params.dealId),
            eq(crmDealCompaniesTable.companyId, parsed.data.contextualCompanyId),
          )).limit(1);
        const metadata = appendRelationshipEvent(
          { ...(existingCompanyLink?.metadata ?? {}),
            legacyRelationship: Boolean(existingCompanyLink) && !Array.isArray(existingCompanyLink.metadata?.relationshipHistory) },
          existingCompanyLink ? (existingCompanyLink.metadata?.inactive === true ? "linked" : "updated") : "linked",
          req.user?.id,
        );
        await tx.insert(crmDealCompaniesTable).values({
          tenantId, dealId: req.params.dealId, companyId: parsed.data.contextualCompanyId,
          role: "contratante", isPrimary: true, metadata, updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [crmDealCompaniesTable.dealId, crmDealCompaniesTable.companyId],
          set: { role: "contratante", isPrimary: true, metadata, updatedAt: new Date() },
        });
      }
      return people;
    });
    return res.status(201).json({ items: result.map((item) => ({ ...item, link: { ...item.link, metadata: safeParticipantMetadata(item.link.metadata, canManageCrmCommissions(req)) } })) });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.post("/crm/deals/:dealId/people", async (req, res) => {
  const parsed = dealPersonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  try {
    const tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
    if (["commission", "commissionHistory"].some((key) =>
        Object.prototype.hasOwnProperty.call(parsed.data.metadata ?? {}, key))) {
      return res.status(403).json({ error: "Comissão restrita a administradores." });
    }
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
    if (personId) {
      const [masterPerson] = await db.select({ id: crmPeopleMasterTable.id, metadata: crmPeopleMasterTable.metadata })
        .from(crmPeopleMasterTable).where(eq(crmPeopleMasterTable.id, personId)).limit(1);
      if (!masterPerson) return res.status(404).json({ error: "Pessoa não encontrada." });
      const [localDeal] = await db.select({ id: crmDealPeopleTable.id })
        .from(crmDealPeopleTable)
        .innerJoin(dealsTable, eq(dealsTable.id, crmDealPeopleTable.dealId))
        .where(and(eq(crmDealPeopleTable.tenantId, tenantId),
          eq(dealsTable.tenantId, tenantId),
          eq(crmDealPeopleTable.personId, personId),
          sql`COALESCE(${crmDealPeopleTable.metadata}->>'inactive', 'false') <> 'true'`,
          ...buildUserFunctionFilter(req, dealsTable))).limit(1);
      const [localContact] = await db.select({ id: crmTenantCompanyContactsTable.id })
        .from(crmTenantCompanyContactsTable)
        .innerJoin(crmTenantCompaniesTable, eq(crmTenantCompaniesTable.id, crmTenantCompanyContactsTable.tenantCompanyId))
        .where(and(eq(crmTenantCompanyContactsTable.tenantId, tenantId),
          eq(crmTenantCompaniesTable.tenantId, tenantId),
          eq(crmTenantCompanyContactsTable.personId, personId),
          inArray(crmTenantCompaniesTable.leadId,
            db.select({ id: leadsTable.id }).from(leadsTable)
              .where(and(eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)))),
        )).limit(1);
      if (!localDeal && !localContact) {
        const [foreignDeal] = await db.select({ id: crmDealPeopleTable.id })
          .from(crmDealPeopleTable).where(eq(crmDealPeopleTable.personId, personId)).limit(1);
        const [foreignContact] = await db.select({ id: crmTenantCompanyContactsTable.id })
          .from(crmTenantCompanyContactsTable).where(eq(crmTenantCompanyContactsTable.personId, personId)).limit(1);
        if (foreignDeal || foreignContact || masterPerson.metadata?.createdTenantId !== tenantId) {
          return res.status(403).json({ error: "Pessoa sem vínculo autorizado neste tenant." });
        }
      }
    }
    const link = await db.transaction(async (tx) => {
      // One database transaction for new master person, deal link and persistent company contacts.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
    if (!personId && parsed.data.person) {
      const p = parsed.data.person;
      const documento = digits(p.documento);
      if (documento) {
        const [existing] = await tx.select({ id: crmPeopleMasterTable.id })
          .from(crmPeopleMasterTable).where(eq(crmPeopleMasterTable.documento, documento)).limit(1);
        if (existing) {
          throw Object.assign(new Error("Documento já cadastrado. Selecione a pessoa existente para vinculá-la ao negócio."), { status: 409 });
        }
      }
      const telefone = digits(p.telefone);
      const email = p.email?.trim().toLowerCase();
      const candidates = await tx.select({
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
        throw Object.assign(new Error("Possível pessoa já cadastrada. Selecione o cadastro existente antes de vincular."), { status: 409 });
      }
      const [person] = await tx.insert(crmPeopleMasterTable).values({
        nome: p.nome.trim(),
        documento: documento || null,
        dataNascimento: p.dataNascimento ?? null,
        telefones: p.telefone ? [p.telefone.trim()] : [],
        emails: email ? [email] : [],
        source: p.source ?? "manual",
        metadata: { createdTenantId: tenantId },
        updatedAt: new Date(),
      }).returning({ id: crmPeopleMasterTable.id });
      personId = person?.id;
    }
    if (!personId) throw Object.assign(new Error("Selecione ou cadastre uma pessoa."), { status: 422 });

      // Serialize primary-contact changes per tenant/deal, preventing concurrent primary flags.

      if (parsed.data.isPrimary) {
        await tx.update(crmDealPeopleTable).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(crmDealPeopleTable.tenantId, tenantId), eq(crmDealPeopleTable.dealId, req.params.dealId)));
    }

      const [previousLink] = await tx.select({ metadata: crmDealPeopleTable.metadata })
        .from(crmDealPeopleTable).where(and(eq(crmDealPeopleTable.tenantId, tenantId),
          eq(crmDealPeopleTable.dealId, req.params.dealId), eq(crmDealPeopleTable.personId, personId))).limit(1);
      // Reativação nunca recupera automaticamente o contato principal antigo.
      const primaryContact = parsed.data.isPrimary;
      const relationshipMetadata = appendRelationshipEvent(
        { ...(previousLink?.metadata ?? {}), ...Object.fromEntries(Object.entries(parsed.data.metadata ?? {}).filter(([key]) => !["relationshipHistory", "inactive", "unlinkedAt", "unlinkedBy", "createdTenantId", "commission", "commissionHistory"].includes(key))), relationshipHistory: previousLink?.metadata?.relationshipHistory, legacyRelationship: Boolean(previousLink) && !Array.isArray(previousLink?.metadata?.relationshipHistory) }, previousLink ? (previousLink.metadata?.inactive === true ? "linked" : "updated") : "linked", req.user?.id,
      );
      const [link] = await tx.insert(crmDealPeopleTable).values({
      tenantId,
      dealId: req.params.dealId,
      personId,
      role: parsed.data.role,
      isPrimary: primaryContact,
      contextualCompanyId: parsed.data.contextualCompanyId ?? null,
      relationshipScope: parsed.data.relationshipScope,
      notes: parsed.data.notes ?? null,
      metadata: relationshipMetadata,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [crmDealPeopleTable.dealId, crmDealPeopleTable.personId],
      set: {
        role: parsed.data.role,
        isPrimary: primaryContact,
        contextualCompanyId: parsed.data.contextualCompanyId ?? null,
        relationshipScope: parsed.data.relationshipScope,
        notes: parsed.data.notes ?? null,
        metadata: relationshipMetadata,
        updatedAt: new Date(),
      },
    }).returning();
    if (parsed.data.relationshipScope === "persistent" && parsed.data.contextualCompanyId) {
      const [tc] = await tx.select().from(crmTenantCompaniesTable).where(and(
        eq(crmTenantCompaniesTable.tenantId, tenantId),
        eq(crmTenantCompaniesTable.companyId, parsed.data.contextualCompanyId),
      )).limit(1);
      if (tc) {
        await tx.insert(crmCompanyPeopleTable).values({
          companyId: parsed.data.contextualCompanyId,
          personId,
          source: "manual",
          updatedAt: new Date(),
        }).onConflictDoNothing();
        await tx.insert(crmTenantCompanyContactsTable).values({
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

      return link;
    });

    return res.status(201).json({ ...link, metadata: safeParticipantMetadata(link.metadata, canManageCrmCommissions(req)) });
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

    const link = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
    const [previousCompanyLink] = await tx.select({ metadata: crmDealCompaniesTable.metadata })
      .from(crmDealCompaniesTable).where(and(eq(crmDealCompaniesTable.tenantId, tenantId),
        eq(crmDealCompaniesTable.dealId, req.params.dealId),
        eq(crmDealCompaniesTable.companyId, parsed.data.companyId))).limit(1);
    const companyMetadata = appendRelationshipEvent({ ...(previousCompanyLink?.metadata ?? {}), legacyRelationship: Boolean(previousCompanyLink) && !Array.isArray(previousCompanyLink?.metadata?.relationshipHistory) },
      previousCompanyLink ? (previousCompanyLink.metadata?.inactive === true ? "linked" : "updated") : "linked", req.user?.id);
    const [link] = await tx.insert(crmDealCompaniesTable).values({
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
      return link;
    });
    return res.status(201).json({ ...link, metadata: safeParticipantMetadata(link.metadata, canManageCrmCommissions(req)) });
  } catch (error: any) {
    return res.status(error.status ?? 500).json({ error: error.message });
  }
});

// Soft-unlink: keep the relationship row and its history for audit and future reactivation.
router.delete("/crm/deals/:dealId/people/:relationId", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    await assertDeal(req, tenantId, req.params.dealId);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
    const [relation] = await tx.select().from(crmDealPeopleTable).where(and(
      eq(crmDealPeopleTable.id, req.params.relationId),
      eq(crmDealPeopleTable.tenantId, tenantId),
      eq(crmDealPeopleTable.dealId, req.params.dealId),
    )).limit(1);
    if (!relation) throw Object.assign(new Error("Vínculo não encontrado."), { status: 404 });
    if (relation.metadata?.inactive === true) return;
    await tx.update(crmDealPeopleTable).set({
      isPrimary: false,
      metadata: appendRelationshipEvent(relation.metadata, "unlinked", req.user?.id),
      updatedAt: new Date(),
    }).where(eq(crmDealPeopleTable.id, relation.id));
    });
    return res.status(204).end();
  } catch (error: any) { return res.status(error.status ?? 500).json({ error: error.message }); }
});

router.delete("/crm/deals/:dealId/companies/:relationId", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    await assertDeal(req, tenantId, req.params.dealId);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${req.params.dealId}))`);
    const [relation] = await tx.select().from(crmDealCompaniesTable).where(and(
      eq(crmDealCompaniesTable.id, req.params.relationId),
      eq(crmDealCompaniesTable.tenantId, tenantId),
      eq(crmDealCompaniesTable.dealId, req.params.dealId),
    )).limit(1);
    if (!relation) throw Object.assign(new Error("Vínculo não encontrado."), { status: 404 });
    if (relation.metadata?.inactive === true) return;
    await tx.update(crmDealCompaniesTable).set({
      isPrimary: false,
      metadata: appendRelationshipEvent(relation.metadata, "unlinked", req.user?.id),
      updatedAt: new Date(),
    }).where(eq(crmDealCompaniesTable.id, relation.id));
    });
    return res.status(204).end();
  } catch (error: any) { return res.status(error.status ?? 500).json({ error: error.message }); }
});

export default router;
