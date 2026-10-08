import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  leadsTable,
  crmCompaniesMasterTable,
  crmPeopleMasterTable,
  crmCompanyPeopleTable,
  crmTenantCompaniesTable,
  crmTenantCompanyContactsTable,
  crmCompanyRelationshipsTable,
  dealsTable,
  conversationsTable,
  activitiesTable,
  propostasTable,
  customerIntelligenceTable,
  type CompanyContactPurpose,
} from "@workspace/db";
import { getCompanyByCnpj, normalizeCnpj, normalizeName } from "../services/cnpjService.js";
import { buildUserFunctionFilter } from "../middlewares/auth.js";

const router: IRouter = Router();

const PURPOSES = [
  "comercial",
  "decisor",
  "compras",
  "financeiro",
  "tecnico",
  "administrativo",
  "suporte",
  "outro",
] as const;

function tenantIdFromRequest(req: any, requested?: string): string {
  if (req.user?.platformRole === "super_admin") {
    const tenantId = requested ?? req.user?.tenantId;
    if (!tenantId) throw Object.assign(new Error("tenantId é obrigatório"), { status: 400 });
    return tenantId;
  }
  if (!req.user?.tenantId) throw Object.assign(new Error("Tenant não identificado"), { status: 403 });
  if (requested && requested !== req.user.tenantId) {
    throw Object.assign(new Error("Acesso negado ao tenant"), { status: 403 });
  }
  return req.user.tenantId;
}

async function loadCompanyContext(tenantId: string, companyId: string, req?: any) {
  const [company] = await db
    .select()
    .from(crmCompaniesMasterTable)
    .where(eq(crmCompaniesMasterTable.id, companyId))
    .limit(1);
  if (!company) return null;

  const [tenantCompany] = await db
    .select()
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, companyId),
    ))
    .limit(1);
  if (!tenantCompany) return null;

  if (tenantCompany.leadId && req) {
    const [accessibleLead] = await db.select({ id: leadsTable.id }).from(leadsTable)
      .where(and(eq(leadsTable.id, tenantCompany.leadId), eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable))).limit(1);
    if (!accessibleLead) return null;
  }

  const contacts = await db
    .select({
      relationId: crmTenantCompanyContactsTable.id,
      personId: crmPeopleMasterTable.id,
      nome: crmPeopleMasterTable.nome,
      documento: crmPeopleMasterTable.documento,
      dataNascimento: crmPeopleMasterTable.dataNascimento,
      telefones: crmPeopleMasterTable.telefones,
      emails: crmPeopleMasterTable.emails,
      socialProfiles: crmPeopleMasterTable.socialProfiles,
      roles: crmTenantCompanyContactsTable.roles,
      isPrimary: crmTenantCompanyContactsTable.isPrimary,
      preferredChannel: crmTenantCompanyContactsTable.preferredChannel,
      priorityByPurpose: crmTenantCompanyContactsTable.priorityByPurpose,
      roleEvidence: crmTenantCompanyContactsTable.roleEvidence,
      roleConfidence: crmTenantCompanyContactsTable.roleConfidence,
      verifiedAt: crmTenantCompanyContactsTable.verifiedAt,
      validUntil: crmTenantCompanyContactsTable.validUntil,
      notes: crmTenantCompanyContactsTable.notes,
      cargo: crmCompanyPeopleTable.cargo,
      qualificacao: crmCompanyPeopleTable.qualificacao,
      isLegalRepresentative: crmCompanyPeopleTable.isLegalRepresentative,
      source: crmCompanyPeopleTable.source,
    })
    .from(crmTenantCompanyContactsTable)
    .innerJoin(crmPeopleMasterTable, eq(crmPeopleMasterTable.id, crmTenantCompanyContactsTable.personId))
    .leftJoin(
      crmCompanyPeopleTable,
      and(
        eq(crmCompanyPeopleTable.companyId, companyId),
        eq(crmCompanyPeopleTable.personId, crmPeopleMasterTable.id),
      ),
    )
    .where(and(
      eq(crmTenantCompanyContactsTable.tenantId, tenantId),
      eq(crmTenantCompanyContactsTable.tenantCompanyId, tenantCompany.id),
    ));

  const parentRelationships = await db
    .select()
    .from(crmCompanyRelationshipsTable)
    .where(eq(crmCompanyRelationshipsTable.childCompanyId, companyId));

  const childRelationships = await db
    .select()
    .from(crmCompanyRelationshipsTable)
    .where(eq(crmCompanyRelationshipsTable.parentCompanyId, companyId));

  return {
    company,
    tenantCompany,
    contacts,
    relationships: {
      parents: parentRelationships,
      children: childRelationships,
    },
  };
}

const enrichSchema = z.object({
  cnpj: z.string().min(14),
  tenantId: z.string().optional(),
  leadId: z.string().optional(),
  relationshipType: z.string().min(1).optional().default("lead"),
});

router.get("/crm/companies", async (req, res) => {
  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined); // tenant-audit: reviewed tenantIdFromRequest enforces authenticated tenant or super_admin override
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const relationshipType = typeof req.query.relationshipType === "string" ? req.query.relationshipType.trim() : "";

  const visibleLeadRows = await db.select({ id: leadsTable.id }).from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)));
  const visibleLeadIds = visibleLeadRows.map((row) => row.id);
  const companyVisibility = visibleLeadIds.length > 0
    ? or(isNull(crmTenantCompaniesTable.leadId), inArray(crmTenantCompaniesTable.leadId, visibleLeadIds))
    : isNull(crmTenantCompaniesTable.leadId);
  const filters = [eq(crmTenantCompaniesTable.tenantId, tenantId), companyVisibility!];
  if (status) filters.push(eq(crmTenantCompaniesTable.status, status));
  if (relationshipType) filters.push(eq(crmTenantCompaniesTable.relationshipType, relationshipType));
  if (q) {
    const like = `%${q}%`;
    const cnpjQuery = q.replace(/\D/g, "");
    filters.push(or(
      ilike(crmCompaniesMasterTable.razaoSocial, like),
      ilike(crmCompaniesMasterTable.nomeFantasia, like),
      ilike(crmCompaniesMasterTable.cnpj, cnpjQuery ? `%${cnpjQuery}%` : like),
    )!);
  }

  const rows = await db
    .select({
      tenantCompanyId: crmTenantCompaniesTable.id,
      leadId: crmTenantCompaniesTable.leadId,
      relationshipType: crmTenantCompaniesTable.relationshipType,
      relationshipStatus: crmTenantCompaniesTable.status,
      relationshipUpdatedAt: crmTenantCompaniesTable.updatedAt,
      companyId: crmCompaniesMasterTable.id,
      cnpj: crmCompaniesMasterTable.cnpj,
      razaoSocial: crmCompaniesMasterTable.razaoSocial,
      nomeFantasia: crmCompaniesMasterTable.nomeFantasia,
      situacaoCadastral: crmCompaniesMasterTable.situacaoCadastral,
      porte: crmCompaniesMasterTable.porte,
      cnaePrincipal: crmCompaniesMasterTable.cnaePrincipal,
      telefone: crmCompaniesMasterTable.telefone,
      email: crmCompaniesMasterTable.email,
      endereco: crmCompaniesMasterTable.endereco,
      source: crmCompaniesMasterTable.source,
      enrichedAt: crmCompaniesMasterTable.enrichedAt,
    })
    .from(crmTenantCompaniesTable)
    .innerJoin(crmCompaniesMasterTable, eq(crmCompaniesMasterTable.id, crmTenantCompaniesTable.companyId))
    .where(and(...filters))
    .orderBy(desc(crmTenantCompaniesTable.updatedAt))
    .limit(500);

  const contacts = await db
    .select({
      tenantCompanyId: crmTenantCompanyContactsTable.tenantCompanyId,
      personId: crmTenantCompanyContactsTable.personId,
      isPrimary: crmTenantCompanyContactsTable.isPrimary,
      verifiedAt: crmTenantCompanyContactsTable.verifiedAt,
    })
    .from(crmTenantCompanyContactsTable)
    .where(eq(crmTenantCompanyContactsTable.tenantId, tenantId));

  const contactStats = new Map<string, { total: number; confirmed: number; primary: number }>();
  for (const contact of contacts) {
    const current = contactStats.get(contact.tenantCompanyId) ?? { total: 0, confirmed: 0, primary: 0 };
    current.total += 1;
    if (contact.verifiedAt) current.confirmed += 1;
    if (contact.isPrimary) current.primary += 1;
    contactStats.set(contact.tenantCompanyId, current);
  }

  return res.json({
    items: rows.map((row) => ({
      ...row,
      contacts: contactStats.get(row.tenantCompanyId) ?? { total: 0, confirmed: 0, primary: 0 },
    })),
    total: rows.length,
  });
});


const linkLeadSchema = z.object({
  tenantId: z.string().optional(),
  leadId: z.string().min(1),
  relationshipType: z.string().min(1).optional().default("lead"),
});

router.post("/crm/companies/:companyId/link-lead", async (req, res) => {
  const parsed = linkLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)))
    .limit(1);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado neste tenant" });

  const [tenantCompany] = await db
    .select()
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, req.params.companyId),
    ))
    .limit(1);
  if (!tenantCompany) return res.status(404).json({ error: "Empresa não encontrada neste tenant" });
  if (!(await loadCompanyContext(tenantId, req.params.companyId, req))) return res.status(404).json({ error: "Empresa não acessível" });

  const [company] = await db
    .select()
    .from(crmCompaniesMasterTable)
    .where(eq(crmCompaniesMasterTable.id, req.params.companyId))
    .limit(1);
  if (!company) return res.status(404).json({ error: "Empresa não encontrada" });

  await db
    .update(crmTenantCompaniesTable)
    .set({
      leadId: parsed.data.leadId,
      relationshipType: parsed.data.relationshipType,
      updatedAt: new Date(),
    })
    .where(eq(crmTenantCompaniesTable.id, tenantCompany.id));

  await db
    .update(leadsTable)
    .set({
      tipoPessoa: "juridica",
      documento: company.cnpj,
      empresa: company.nomeFantasia || company.razaoSocial || null,
      updatedAt: new Date(),
    } as any)
    .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)));

  const context = await loadCompanyContext(tenantId, company.id, req);
  return res.json(context);
});

router.post("/crm/companies/enrich", async (req, res) => {
  const parsed = enrichSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const cnpj = normalizeCnpj(parsed.data.cnpj);
  if (cnpj.length !== 14) return res.status(422).json({ error: "CNPJ inválido" });

  if (parsed.data.leadId) {
    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)))
      .limit(1);
    if (!lead) return res.status(404).json({ error: "Lead não encontrado neste tenant" });
  }

  const enriched = await getCompanyByCnpj(cnpj);
  if (!enriched) return res.status(404).json({ error: "Não foi possível enriquecer este CNPJ" });

  const now = new Date();
  const [company] = await db
    .insert(crmCompaniesMasterTable)
    .values({
      cnpj,
      razaoSocial: enriched.razaoSocial,
      nomeFantasia: enriched.nomeFantasia,
      situacaoCadastral: enriched.situacao,
      porte: enriched.porte,
      capitalSocial: enriched.capitalSocial != null ? String(enriched.capitalSocial) : null,
      dataAbertura: enriched.dataAbertura,
      cnaePrincipal: [enriched.cnaeCode, enriched.cnaeDescricao].filter(Boolean).join(" - "),
      cnaesSecundarios: enriched.cnaesSecundarios.map((item) => ({ codigo: item.code, descricao: item.descricao })),
      endereco: {
        logradouro: enriched.logradouro,
        numero: enriched.numero,
        complemento: enriched.complemento,
        bairro: enriched.bairro,
        municipio: enriched.municipio,
        uf: enriched.uf,
        cep: enriched.cep,
        pais: "Brasil",
      },
      telefone: enriched.telefone,
      email: enriched.email,
      source: "brasilapi",
      enrichmentData: { enderecoCompleto: enriched.enderecoCompleto },
      enrichedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: crmCompaniesMasterTable.cnpj,
      set: {
        razaoSocial: enriched.razaoSocial,
        nomeFantasia: enriched.nomeFantasia,
        situacaoCadastral: enriched.situacao,
        porte: enriched.porte,
        capitalSocial: enriched.capitalSocial != null ? String(enriched.capitalSocial) : null,
        dataAbertura: enriched.dataAbertura,
        cnaePrincipal: [enriched.cnaeCode, enriched.cnaeDescricao].filter(Boolean).join(" - "),
        cnaesSecundarios: enriched.cnaesSecundarios.map((item) => ({ codigo: item.code, descricao: item.descricao })),
        endereco: {
          logradouro: enriched.logradouro,
          numero: enriched.numero,
          complemento: enriched.complemento,
          bairro: enriched.bairro,
          municipio: enriched.municipio,
          uf: enriched.uf,
          cep: enriched.cep,
          pais: "Brasil",
        },
        telefone: enriched.telefone,
        email: enriched.email,
        source: "brasilapi",
        enrichmentData: { enderecoCompleto: enriched.enderecoCompleto },
        enrichedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  if (!company) return res.status(500).json({ error: "Falha ao salvar empresa" });

  const [tenantCompany] = await db
    .insert(crmTenantCompaniesTable)
    .values({
      tenantId,
      companyId: company.id,
      leadId: parsed.data.leadId ?? null,
      relationshipType: parsed.data.relationshipType,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [crmTenantCompaniesTable.tenantId, crmTenantCompaniesTable.companyId],
      set: {
        leadId: parsed.data.leadId ?? null,
        relationshipType: parsed.data.relationshipType,
        updatedAt: now,
      },
    })
    .returning();

  if (!tenantCompany) return res.status(500).json({ error: "Falha ao vincular empresa ao tenant" });

  const existingPeople = await db
    .select({
      personId: crmPeopleMasterTable.id,
      nome: crmPeopleMasterTable.nome,
    })
    .from(crmCompanyPeopleTable)
    .innerJoin(crmPeopleMasterTable, eq(crmPeopleMasterTable.id, crmCompanyPeopleTable.personId))
    .where(eq(crmCompanyPeopleTable.companyId, company.id));

  const existingByName = new Map(existingPeople.map((p) => [normalizeName(p.nome), p.personId]));

  for (const socio of enriched.socios.filter((item) => item.nome.trim())) {
    const key = normalizeName(socio.nome);
    let personId = existingByName.get(key);

    if (!personId) {
      const [person] = await db
        .insert(crmPeopleMasterTable)
        .values({
          nome: socio.nome.trim(),
          dataNascimento: socio.dataNascimento ?? null,
          source: "qsa_brasilapi",
        })
        .returning({ id: crmPeopleMasterTable.id });
      personId = person?.id;
      if (personId) existingByName.set(key, personId);
    }
    if (!personId) continue;

    await db
      .insert(crmCompanyPeopleTable)
      .values({
        companyId: company.id,
        personId,
        cargo: socio.qualificacao || null,
        qualificacao: socio.qualificacao || null,
        isLegalRepresentative: true,
        source: "qsa_brasilapi",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [crmCompanyPeopleTable.companyId, crmCompanyPeopleTable.personId],
        set: {
          cargo: socio.qualificacao || null,
          qualificacao: socio.qualificacao || null,
          isLegalRepresentative: true,
          source: "qsa_brasilapi",
          updatedAt: now,
        },
      });

    const [existingTenantContact] = await db
      .select({ id: crmTenantCompanyContactsTable.id })
      .from(crmTenantCompanyContactsTable)
      .where(and(
        eq(crmTenantCompanyContactsTable.tenantCompanyId, tenantCompany.id),
        eq(crmTenantCompanyContactsTable.personId, personId),
      ))
      .limit(1);

    // QSA comprova o vínculo societário/administrativo, mas NÃO prova que a pessoa
    // é o decisor comercial, contato principal ou contato autorizado deste tenant.
    // Se já houver um papel confirmado manualmente, o reenriquecimento nunca o sobrescreve.
    if (!existingTenantContact) {
      await db
        .insert(crmTenantCompanyContactsTable)
        .values({
          tenantId,
          tenantCompanyId: tenantCompany.id,
          personId,
          roles: [],
          isPrimary: false,
          priorityByPurpose: {},
          roleEvidence: [{
            source: "qsa_brasilapi",
            detail: socio.qualificacao || "Vínculo identificado no QSA",
            observedAt: now.toISOString(),
          }],
          roleConfidence: "0.00",
          verifiedAt: null,
          metadata: {
            discoveredBy: "qsa",
            roleStatus: "unconfirmed",
            qsaQualification: socio.qualificacao || null,
          },
          updatedAt: now,
        });
    }
  }

  if (parsed.data.leadId) {
    await db
      .update(leadsTable)
      .set({
        tipoPessoa: "juridica",
        documento: cnpj,
        empresa: enriched.nomeFantasia ?? enriched.razaoSocial,
        endereco: enriched.enderecoCompleto || undefined,
        telefone: enriched.telefone ?? undefined,
        dadosPj: {
          cnpj,
          razaoSocial: enriched.razaoSocial,
          segmento: enriched.cnaeDescricao,
          socios: enriched.socios.map((s) => ({
            nome: s.nome,
            dataNascimento: s.dataNascimento,
          })),
        },
        updatedAt: now,
      })
      .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)));
  }

  return res.status(200).json(await loadCompanyContext(tenantId, company.id, req));
});

router.get("/crm/companies/:companyId/context", async (req, res) => {
  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined); // tenant-audit: reviewed tenantIdFromRequest enforces authenticated tenant or super_admin override
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const context = await loadCompanyContext(tenantId, req.params.companyId, req);
  if (!context) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });
  return res.json(context);
});

router.get("/crm/leads/:leadId/company-context", async (req, res) => {
  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined); // tenant-audit: reviewed tenantIdFromRequest enforces authenticated tenant or super_admin override
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const [link] = await db
    .select({ companyId: crmTenantCompaniesTable.companyId })
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.leadId, req.params.leadId),
    ))
    .limit(1);

  if (!link) return res.status(404).json({ error: "Lead ainda não possui empresa mestre vinculada" });
  return res.json(await loadCompanyContext(tenantId, link.companyId, req));
});

const addContactSchema = z.object({
  tenantId: z.string().optional(),
  nome: z.string().min(2),
  documento: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email().optional(),
  cargo: z.string().optional(),
  qualificacao: z.string().optional(),
  roles: z.array(z.enum(PURPOSES)).default(["outro"]),
  isPrimary: z.boolean().optional().default(false),
  preferredChannel: z.string().optional(),
  notes: z.string().optional(),
  roleEvidence: z.array(z.object({
    source: z.string().min(1),
    detail: z.string().optional(),
    observedAt: z.string().optional(),
  })).optional(),
});

router.post("/crm/companies/:companyId/contacts", async (req, res) => {
  const parsed = addContactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const [tenantCompany] = await db
    .select()
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, req.params.companyId),
    ))
    .limit(1);
  if (!tenantCompany) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });
  if (!(await loadCompanyContext(tenantId, req.params.companyId, req))) return res.status(404).json({ error: "Empresa não acessível" });

  const [person] = await db
    .insert(crmPeopleMasterTable)
    .values({
      nome: parsed.data.nome.trim(),
      documento: parsed.data.documento?.replace(/\D/g, "") || null,
      telefones: parsed.data.telefone ? [parsed.data.telefone] : [],
      emails: parsed.data.email ? [parsed.data.email] : [],
      source: "manual",
    })
    .returning();
  if (!person) return res.status(500).json({ error: "Falha ao criar contato" });

  await db.insert(crmCompanyPeopleTable).values({
    companyId: req.params.companyId,
    personId: person.id,
    cargo: parsed.data.cargo ?? null,
    qualificacao: parsed.data.qualificacao ?? null,
    source: "manual",
  });

  await db.insert(crmTenantCompanyContactsTable).values({
    tenantId,
    tenantCompanyId: tenantCompany.id,
    personId: person.id,
    roles: parsed.data.roles,
    isPrimary: parsed.data.isPrimary,
    preferredChannel: parsed.data.preferredChannel ?? null,
    notes: parsed.data.notes ?? null,
    roleEvidence: parsed.data.roleEvidence ?? [{ source: "manual", detail: "Contato cadastrado/confirmado pelo tenant", observedAt: new Date().toISOString() }],
    roleConfidence: "1.00",
    verifiedAt: new Date(),
    metadata: { roleStatus: "confirmed" },
  });

  return res.status(201).json(await loadCompanyContext(tenantId, req.params.companyId, req));
});

const contactRolePatchSchema = z.object({
  tenantId: z.string().optional(),
  roles: z.array(z.enum(PURPOSES)).min(1),
  isPrimary: z.boolean().optional(),
  preferredChannel: z.string().optional().nullable(),
  priorityByPurpose: z.record(z.string(), z.number().min(0).max(100)).optional(),
  evidence: z.object({
    source: z.string().min(1).default("manual"),
    detail: z.string().optional(),
  }).optional(),
  validUntil: z.string().datetime().optional().nullable(),
});

router.patch("/crm/companies/:companyId/contacts/:relationId/roles", async (req, res) => {
  const parsed = contactRolePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const [tenantCompany] = await db
    .select({ id: crmTenantCompaniesTable.id })
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.companyId, req.params.companyId),
    ))
    .limit(1);
  if (!tenantCompany) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });
  if (!(await loadCompanyContext(tenantId, req.params.companyId, req))) return res.status(404).json({ error: "Empresa não acessível" });

  const [existing] = await db
    .select()
    .from(crmTenantCompanyContactsTable)
    .where(and(
      eq(crmTenantCompanyContactsTable.id, req.params.relationId),
      eq(crmTenantCompanyContactsTable.tenantId, tenantId),
      eq(crmTenantCompanyContactsTable.tenantCompanyId, tenantCompany.id),
    ))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Contato não encontrado neste tenant" });

  const now = new Date();
  const evidence = [
    ...((existing.roleEvidence ?? []) as Array<{ source: string; detail?: string; observedAt?: string }>),
    {
      source: parsed.data.evidence?.source ?? "manual",
      detail: parsed.data.evidence?.detail ?? "Papéis confirmados pelo tenant",
      observedAt: now.toISOString(),
    },
  ];

  await db
    .update(crmTenantCompanyContactsTable)
    .set({
      roles: parsed.data.roles,
      isPrimary: parsed.data.isPrimary ?? existing.isPrimary,
      preferredChannel: parsed.data.preferredChannel === undefined ? existing.preferredChannel : parsed.data.preferredChannel,
      priorityByPurpose: parsed.data.priorityByPurpose ?? existing.priorityByPurpose,
      roleEvidence: evidence,
      roleConfidence: "1.00",
      verifiedAt: now,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : parsed.data.validUntil === null ? null : existing.validUntil,
      metadata: {
        ...((existing.metadata ?? {}) as Record<string, unknown>),
        roleStatus: "confirmed",
      },
      updatedAt: now,
    })
    .where(eq(crmTenantCompanyContactsTable.id, existing.id));

  return res.json(await loadCompanyContext(tenantId, req.params.companyId, req));
});

const relationshipSchema = z.object({
  tenantId: z.string().optional(),
  relatedCompanyId: z.string().min(1),
  direction: z.enum(["parent", "child"]),
  relationshipType: z.enum([
    "grupo_economico",
    "controladora",
    "controlada",
    "matriz",
    "filial",
    "coligada",
    "parceira",
    "outra",
  ]),
  source: z.string().optional().default("manual"),
  confidence: z.number().min(0).max(1).optional().default(1),
  notes: z.string().optional(),
});

router.post("/crm/companies/:companyId/relationships", async (req, res) => {
  const parsed = relationshipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, parsed.data.tenantId);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const companyId = req.params.companyId;
  if (companyId === parsed.data.relatedCompanyId) {
    return res.status(422).json({ error: "Uma empresa não pode ser relacionada a ela mesma" });
  }

  const visibleLeadRows = await db.select({ id: leadsTable.id }).from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, leadsTable)));
  const visibleLeadIds = visibleLeadRows.map((row) => row.id);
  const companyVisibility = visibleLeadIds.length > 0
    ? or(isNull(crmTenantCompaniesTable.leadId), inArray(crmTenantCompaniesTable.leadId, visibleLeadIds))
    : isNull(crmTenantCompaniesTable.leadId);
  const tenantLinks = await db
    .select({ companyId: crmTenantCompaniesTable.companyId })
    .from(crmTenantCompaniesTable)
    .where(and(eq(crmTenantCompaniesTable.tenantId, tenantId), companyVisibility!));
  const allowed = new Set(tenantLinks.map((row) => row.companyId));
  if (!allowed.has(companyId) || !allowed.has(parsed.data.relatedCompanyId)) {
    return res.status(403).json({ error: "As duas empresas precisam estar vinculadas a este tenant" });
  }

  const parentCompanyId = parsed.data.direction === "parent" ? parsed.data.relatedCompanyId : companyId;
  const childCompanyId = parsed.data.direction === "parent" ? companyId : parsed.data.relatedCompanyId;
  const now = new Date();

  await db
    .insert(crmCompanyRelationshipsTable)
    .values({
      parentCompanyId,
      childCompanyId,
      relationshipType: parsed.data.relationshipType,
      source: parsed.data.source,
      confidence: String(parsed.data.confidence),
      verifiedAt: now,
      metadata: parsed.data.notes ? { notes: parsed.data.notes, confirmedByTenantId: tenantId } : { confirmedByTenantId: tenantId },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        crmCompanyRelationshipsTable.parentCompanyId,
        crmCompanyRelationshipsTable.childCompanyId,
        crmCompanyRelationshipsTable.relationshipType,
      ],
      set: {
        source: parsed.data.source,
        confidence: String(parsed.data.confidence),
        verifiedAt: now,
        metadata: parsed.data.notes ? { notes: parsed.data.notes, confirmedByTenantId: tenantId } : { confirmedByTenantId: tenantId },
        updatedAt: now,
      },
    });

  return res.status(201).json(await loadCompanyContext(tenantId, companyId));
});

router.get("/crm/companies/:companyId/workspace", async (req, res) => {
  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined); // tenant-audit: reviewed tenantIdFromRequest enforces authenticated tenant or super_admin override
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const context = await loadCompanyContext(tenantId, req.params.companyId, req);
  if (!context) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });

  const leadId = context.tenantCompany.leadId;
  if (!leadId) {
    return res.json({
      ...context,
      lead: null,
      opportunities: [],
      conversations: [],
      orders: [],
      finance: [],
      documents: [],
      activities: [],
      proposals: [],
      intelligence: null,
      counts: {
        people: context.contacts.length,
        opportunities: 0,
        conversations: 0,
        orders: 0,
        finance: 0,
        documents: 0,
        activities: 0,
        proposals: 0,
      },
    });
  }

  const [leadRows, opportunities, conversations, activities, proposals, intelligenceRows] = await Promise.all([
    db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId))).limit(1),
    db.select().from(dealsTable).where(and(eq(dealsTable.leadId, leadId), eq(dealsTable.tenantId, tenantId))),
    db.select().from(conversationsTable).where(and(eq(conversationsTable.leadId, leadId), eq(conversationsTable.tenantId, tenantId))),
    db.select().from(activitiesTable).where(and(eq(activitiesTable.leadId, leadId), eq(activitiesTable.tenantId, tenantId))),
    db.select().from(propostasTable).where(and(eq(propostasTable.leadId, leadId), eq(propostasTable.tenantId, tenantId))),
    db.select().from(customerIntelligenceTable).where(and(
      eq(customerIntelligenceTable.leadId, leadId),
      eq(customerIntelligenceTable.tenantId, tenantId),
    )).limit(1),
  ]);

  const proposalValueByDeal = new Map<string, { value: string; updatedAt: number }>();
  for (const proposal of proposals) {
    if (!proposal.dealId || proposal.valorTotal == null) continue;
    const updatedAt = new Date(proposal.updatedAt ?? proposal.createdAt ?? 0).getTime();
    const current = proposalValueByDeal.get(proposal.dealId);
    if (!current || updatedAt >= current.updatedAt) {
      proposalValueByDeal.set(proposal.dealId, { value: String(proposal.valorTotal), updatedAt });
    }
  }
  const canonicalOpportunities = opportunities.map((deal) => ({
    ...deal,
    valor: proposalValueByDeal.get(deal.id)?.value ?? deal.valor,
  }));

  const orders = canonicalOpportunities.filter((deal) =>
    ["ganho", "em_execucao", "entregue", "conferencia_estoque"].includes(deal.etapa),
  );

  const finance = canonicalOpportunities
    .filter((deal) => deal.valor || deal.chargeStatus || deal.asaasChargeId || deal.chargeLink)
    .map((deal) => ({
      id: deal.id,
      titulo: deal.titulo,
      valor: deal.valor,
      etapa: deal.etapa,
      chargeStatus: deal.chargeStatus,
      chargeLink: deal.chargeLink,
      cobrancaTipo: deal.cobrancaTipo,
      dataFechamento: deal.dataFechamento,
      updatedAt: deal.updatedAt,
    }));

  const documents = [
    ...activities
      .filter((activity) => activity.anexoUrl)
      .map((activity) => ({
        id: `activity:${activity.id}`,
        source: "activity",
        name: activity.anexoNome ?? activity.titulo,
        url: activity.anexoUrl,
        mimeType: activity.anexoMimeType,
        category: activity.anexoCategoria,
        createdAt: activity.createdAt,
      })),
    ...proposals
      .filter((proposal) => proposal.arquivoImportadoUrl)
      .map((proposal) => ({
        id: `proposal:${proposal.id}`,
        source: "proposal",
        name: proposal.arquivoImportadoNome ?? proposal.titulo,
        url: proposal.arquivoImportadoUrl,
        mimeType: null,
        category: "proposta",
        createdAt: proposal.createdAt,
      })),
  ];

  return res.json({
    ...context,
    lead: leadRows[0] ?? null,
    opportunities: canonicalOpportunities,
    conversations,
    orders,
    finance,
    documents,
    activities,
    proposals,
    intelligence: intelligenceRows[0] ?? null,
    counts: {
      people: context.contacts.length,
      opportunities: canonicalOpportunities.length,
      conversations: conversations.length,
      orders: orders.length,
      finance: finance.length,
      documents: documents.length,
      activities: activities.length,
      proposals: proposals.length,
    },
  });
});

router.get("/crm/companies/:companyId/contact-for", async (req, res) => {
  const purpose = z.enum(PURPOSES).safeParse(req.query.purpose ?? "comercial");
  if (!purpose.success) return res.status(422).json({ error: "Finalidade inválida" });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined); // tenant-audit: reviewed tenantIdFromRequest enforces authenticated tenant or super_admin override
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const context = await loadCompanyContext(tenantId, req.params.companyId, req);
  if (!context) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });

  const ranked = [...context.contacts]
    .filter((c) => {
      const confirmed = (c.metadata as Record<string, unknown> | null)?.roleStatus === "confirmed" || !!c.verifiedAt;
      const notExpired = !c.validUntil || new Date(c.validUntil).getTime() >= Date.now();
      return confirmed && notExpired && (c.roles?.includes(purpose.data) || c.isPrimary);
    })
    .sort((a, b) => {
      const ap =
        Number(a.priorityByPurpose?.[purpose.data] ?? 0) +
        Number(a.roleConfidence ?? 0) * 10 +
        (a.roles?.includes(purpose.data) ? 100 : 0) +
        (a.isPrimary ? 25 : 0);
      const bp =
        Number(b.priorityByPurpose?.[purpose.data] ?? 0) +
        Number(b.roleConfidence ?? 0) * 10 +
        (b.roles?.includes(purpose.data) ? 100 : 0) +
        (b.isPrimary ? 25 : 0);
      return bp - ap;
    });

  return res.json({
    purpose: purpose.data,
    company: context.company,
    contact: ranked[0] ?? null,
    alternatives: ranked.slice(1),
  });
});

export default router;
