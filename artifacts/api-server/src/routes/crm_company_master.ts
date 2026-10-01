import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  leadsTable,
  crmCompaniesMasterTable,
  crmPeopleMasterTable,
  crmCompanyPeopleTable,
  crmTenantCompaniesTable,
  crmTenantCompanyContactsTable,
  type CompanyContactPurpose,
} from "@workspace/db";
import { getCompanyByCnpj, normalizeCnpj, normalizeName } from "../services/cnpjService.js";

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

function defaultRolesForQsa(qualificacao: string): CompanyContactPurpose[] {
  const q = qualificacao.toLocaleLowerCase("pt-BR");
  const roles = new Set<CompanyContactPurpose>(["decisor"]);
  if (q.includes("administrador") || q.includes("diretor") || q.includes("sócio") || q.includes("socio")) {
    roles.add("comercial");
  }
  return [...roles];
}

async function loadCompanyContext(tenantId: string, companyId: string) {
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

  return { company, tenantCompany, contacts };
}

const enrichSchema = z.object({
  cnpj: z.string().min(14),
  tenantId: z.string().optional(),
  leadId: z.string().optional(),
  relationshipType: z.string().min(1).optional().default("lead"),
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
      .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId)))
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

    const roles = defaultRolesForQsa(socio.qualificacao);
    await db
      .insert(crmTenantCompanyContactsTable)
      .values({
        tenantId,
        tenantCompanyId: tenantCompany.id,
        personId,
        roles,
        isPrimary: enriched.socios.length === 1,
        priorityByPurpose: roles.includes("decisor") ? { decisor: 10, comercial: 5 } : {},
        metadata: { discoveredBy: "qsa" },
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [crmTenantCompanyContactsTable.tenantCompanyId, crmTenantCompanyContactsTable.personId],
        set: {
          roles,
          metadata: { discoveredBy: "qsa" },
          updatedAt: now,
        },
      });
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
      .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId)));
  }

  return res.status(200).json(await loadCompanyContext(tenantId, company.id));
});

router.get("/crm/companies/:companyId/context", async (req, res) => {
  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const context = await loadCompanyContext(tenantId, req.params.companyId);
  if (!context) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });
  return res.json(context);
});

router.get("/crm/leads/:leadId/company-context", async (req, res) => {
  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
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
  return res.json(await loadCompanyContext(tenantId, link.companyId));
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
  });

  return res.status(201).json(await loadCompanyContext(tenantId, req.params.companyId));
});

router.get("/crm/companies/:companyId/contact-for", async (req, res) => {
  const purpose = z.enum(PURPOSES).safeParse(req.query.purpose ?? "comercial");
  if (!purpose.success) return res.status(422).json({ error: "Finalidade inválida" });

  let tenantId: string;
  try {
    tenantId = tenantIdFromRequest(req, typeof req.query.tenantId === "string" ? req.query.tenantId : undefined);
  } catch (err: any) {
    return res.status(err.status ?? 403).json({ error: err.message });
  }

  const context = await loadCompanyContext(tenantId, req.params.companyId);
  if (!context) return res.status(404).json({ error: "Empresa não vinculada a este tenant" });

  const ranked = [...context.contacts]
    .filter((c) => c.roles?.includes(purpose.data) || c.isPrimary)
    .sort((a, b) => {
      const ap = Number(a.priorityByPurpose?.[purpose.data] ?? 0) + (a.isPrimary ? 100 : 0);
      const bp = Number(b.priorityByPurpose?.[purpose.data] ?? 0) + (b.isPrimary ? 100 : 0);
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
