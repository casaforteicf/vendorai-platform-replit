import { Router, type IRouter } from "express";
import { and, eq, inArray, desc, ilike, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  leadsTable,
  insertLeadSchema,
  updateLeadSchema,
  conversationsTable,
  messagesTable,
  dealsTable,
  pipelineStagesTable,
  propostasTable,
  activitiesTable,
  customerIntelligenceTable,
  agentTasksTable,
  agentActionsLogTable,
  consentsTable,
  intelligenceAnalysisLogTable,
  leadBriefingsTable,
  leadProposalsTable,
  updateLeadBriefingSchema,
  businessProfilesTable,
  usersTable,
  beautyAgendamentosTable,
  beautyProntuariosTable,
  clientServiceGapsTable,
  clinicConsultasTable,
  clinicProntuariosTable,
  fretesCargasTable,
  imoveisVisitasTable,
  scoutOportunidadesTable,
  servicosOrdensTable,
  veiculosTestDrivesTable,
  adCampaignsTable,
  leadResponsavelHistoricoTable,
  tenantUserFunctionsTable,
  tenantsTable,
} from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { buildUserFunctionFilter, requireAdminOrUserFunction, type UserFunction } from "../middlewares/auth.js";
import { callOpenAI } from "../lib/ai-gateway.js";
import { pickNextVendedor } from "../lib/round-robin.js";
import { geocodeAddressWithTimeout } from "../lib/geocoding.js";
import { recordResponsavelChange } from "../lib/leadResponsavelHistorico.js";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";
import { getActiveCatalogPreview, compactCatalogNames } from "../lib/catalog-readiness.js";
import { reserveUniqueVehicle } from "../services/vehicle-reservation.js";
import { reserveUniqueItem } from "../services/item-reservation.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { enrichLead } from "../jobs/leadEnrichment.js";

const router: IRouter = Router();

const DEFAULT_NON_LEAD_CLASSIFICATIONS = [
  { id: "colaborador", label: "Colaborador", active: true },
  { id: "fornecedor", label: "Fornecedor", active: true },
  { id: "parceiro", label: "Parceiro", active: true },
  { id: "familiar", label: "Familiar", active: true },
  { id: "amigo", label: "Amigo", active: true },
  { id: "outro", label: "Outro", active: true },
];

const nonLeadClassificationSchema = z.object({
  id: z.string().trim().min(2).max(50).regex(/^[a-z0-9_-]+$/),
  label: z.string().trim().min(2).max(80),
  active: z.boolean().optional().default(true),
  description: z.string().trim().max(240).optional(),
});

const nonLeadClassificationsBodySchema = z.object({
  classifications: z.array(nonLeadClassificationSchema).min(1).max(50),
});

async function validateRepresentativeFunction(tenantId: string, functionId: string | null | undefined) {
  if (!functionId) return null;
  const [representativeFunction] = await db
    .select()
    .from(tenantUserFunctionsTable)
    .where(and(
      eq(tenantUserFunctionsTable.id, functionId),
      eq(tenantUserFunctionsTable.tenantId, tenantId),
      eq(tenantUserFunctionsTable.kind, "external_company"),
    ))
    .limit(1);
  return representativeFunction ?? null;
}

async function findRepresentativeLeadAccess(req: any, targetTenantId: string, functionId?: string | null) {
  const sourceTenantId = req.user?.tenantId;
  if (!sourceTenantId || sourceTenantId === targetTenantId) return null;

  const conditions = [
    eq(tenantUserFunctionsTable.tenantId, targetTenantId),
    eq(tenantUserFunctionsTable.linkedTenantId, sourceTenantId),
    eq(tenantUserFunctionsTable.kind, "external_company"),
  ];
  if (functionId) conditions.push(eq(tenantUserFunctionsTable.id, functionId));

  const [link] = await db
    .select()
    .from(tenantUserFunctionsTable)
    .where(and(...conditions))
    .limit(1);

  if (!link || !Array.isArray(link.permissions) || !link.permissions.includes("leads")) return null;

  const allowedUsers = Array.isArray(link.representativeUserIds) ? link.representativeUserIds : [];
  if (allowedUsers.length > 0 && req.user?.sub && !allowedUsers.includes(req.user.sub)) return null;
  return link;
}

router.get("/leads", async (req, res) => {
  const conditions: ReturnType<typeof eq>[] = [];
  if (req.user?.platformRole !== "super_admin") {
    if (!req.user?.tenantId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    conditions.push(eq(leadsTable.tenantId, req.user.tenantId));
  }
  conditions.push(...buildUserFunctionFilter(req, leadsTable));

  const leads = await db
    .select()
    .from(leadsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(leadsTable.createdAt);
  res.json(leads);
});

router.post("/leads", async (req, res) => {
  // Formulários e landing pages podem enviar apenas o código público da
  // campanha. O backend resolve o vínculo, sem confiar em um ID informado
  // pelo navegador e sem exigir conhecimento técnico do integrador.
  const rawBody = { ...(req.body ?? {}) };
  const metadata = rawBody.metadata && typeof rawBody.metadata === "object" ? rawBody.metadata : {};
  const attributionCode = [rawBody.utmCode, rawBody.utm_code, rawBody.adCode, metadata.utmCode, metadata.utm_code, metadata.adCode]
    .find((value) => typeof value === "string" && /^vai_[a-z0-9]{6,20}$/i.test(value)) as string | undefined;
  if (!rawBody.adCampaignId && attributionCode && typeof rawBody.tenantId === "string") {
    const [campaign] = await db.select({ id: adCampaignsTable.id }).from(adCampaignsTable)
      .where(and(eq(adCampaignsTable.tenantId, rawBody.tenantId), eq(adCampaignsTable.utmCode, attributionCode.toLowerCase())));
    if (campaign) {
      rawBody.adCampaignId = campaign.id;
      rawBody.source = rawBody.source && rawBody.source !== "manual" ? rawBody.source : "anuncio";
      rawBody.metadata = { ...metadata, attributionCode, attributedBy: "campaign_code" };
    }
  }

  const parsed = insertLeadSchema.safeParse(rawBody);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data = parsed.data;

  if (data.representativeFunctionId) {
    const representativeFunction = await validateRepresentativeFunction(data.tenantId, data.representativeFunctionId);
    if (!representativeFunction) {
      res.status(422).json({ error: "Empresa representante inválida para este tenant." });
      return;
    }
    const isAdminCreator = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
    if (!isAdminCreator) {
      res.status(403).json({ error: "Apenas administradores podem atribuir uma empresa representante." });
      return;
    }
  }

  // Dedup check
  const match = await findLeadByDedup(data.tenantId, data.telefone ?? null, data.documento ?? null, data.nome);

  if (match.found) {
    res.status(409).json({
      error: "Lead already exists",
      isDuplicate: true,
      lead: match.lead,
      matchBy: match.matchBy,
    });
    return;
  }

  if (match.similar) {
    res.status(409).json({
      error: "Já existe um lead com nome semelhante",
      isDuplicate: true,
      lead: match.similar,
      matchBy: "nome",
    });
    return;
  }

  // Resolve assignedTo:
  // 1. If creator is a seller → assign to themselves
  // 2. If admin/no explicit assignedTo → round-robin to next active vendedor
  // 3. If admin set assignedTo explicitly → use that value
  const isAdminCreator = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSellerCreator = !isAdminCreator && (req.user?.platformRole === "tenant_seller" || (req.user?.userFunction as string) === "vendedor" || (req.user?.userFunction as string) === "representante_comercial");
  let resolvedAssignedTo: string | null;
  let geocoded: { lat: number; lng: number } | null = null;
  if (data.representativeFunctionId) {
    resolvedAssignedTo = null;
  } else if (isSellerCreator) {
    resolvedAssignedTo = req.user?.sub ?? null;
  } else if (data.assignedTo) {
    resolvedAssignedTo = data.assignedTo;
  } else {
    // Geocoding só roda quando a atribuição automática vai de fato precisar
    // (round-robin abaixo) — evita gastar a cota de 1 req/s do Nominatim em
    // todo lead criado, e nunca bloqueia a criação por mais de ~2.5s: se o
    // serviço demorar ou falhar, o motor cai pro resto da cascata (cidade/
    // região/geral) normalmente, sem coordenadas.
    geocoded = data.endereco ? await geocodeAddressWithTimeout(data.endereco) : null;
    resolvedAssignedTo = await pickNextVendedor(data.tenantId, {
      segmento: data.mercadoSegmento,
      location: data.endereco,
      lat: geocoded?.lat ?? null,
      lng: geocoded?.lng ?? null,
    });
  }

  const [lead] = await db.insert(leadsTable).values({
    ...data,
    assignedTo: resolvedAssignedTo,
    latitude: geocoded?.lat ?? null,
    longitude: geocoded?.lng ?? null,
    telefone: storePhone(data.telefone),
    documento: data.documento ? data.documento.replace(/\D/g, "") : data.documento,
    possivelDuplicata: false,
    leadSimilarId: null,
  } as any).returning();

  // Auto-create deal in pipeline (aquecimento) unless lead is pipeline-exempt
  if (!lead.pipelineExempt) {
    await db.insert(dealsTable).values({
      tenantId: lead.tenantId,
      leadId: lead.id,
      titulo: lead.nome,
      etapa: "em_aquecimento",
      assignedTo: resolvedAssignedTo,
    });
  }

  if (resolvedAssignedTo) {
    recordResponsavelChange({
      leadId: lead.id,
      responsavelAnteriorId: null,
      responsavelNovoId: resolvedAssignedTo,
      alteradoPorId: req.user?.sub ?? null,
      motivo: isSellerCreator || data.assignedTo ? "manual" : "automatico",
    }).catch(() => {});
  }

  // Leads atribuídos por UTM a uma campanha "Modo: Só este item" entram
  // automaticamente no fluxo de reserva. Veículo continua no fluxo
  // dedicado (reserveUniqueVehicle, com reserva de estoque real); os
  // outros tipos (imóvel, produto, landing_page, livre) entram no fluxo
  // genérico (reserveUniqueItem) -- generalização pedida pelo Marcos:
  // pausar+prazo do vendedor serve pra qualquer "Modo: Só este item",
  // não só veículo. Cada função ignora silenciosamente o tipo que não é
  // seu, sem impedir o cadastro normal do lead.
  if (lead.adCampaignId) {
    await recordAdCampaignEvent({
      tenantId: lead.tenantId,
      campaignId: lead.adCampaignId,
      userId: req.user?.sub ?? null,
      eventType: "lead_attributed",
      severity: "success",
      message: `Lead ${lead.nome} atribuído à campanha por formulário ou landing page.`,
      dedupeKey: `lead:${lead.id}`,
      metadata: { leadId: lead.id, source: lead.source },
    });
    reserveUniqueVehicle({
      tenantId: lead.tenantId, campaignId: lead.adCampaignId,
      leadId: lead.id, sellerId: resolvedAssignedTo,
    }).catch((error) => req.log?.warn?.({ err: error, leadId: lead.id }, "lead: automatic vehicle reservation skipped"));
    reserveUniqueItem({
      tenantId: lead.tenantId, campaignId: lead.adCampaignId,
      leadId: lead.id, sellerId: resolvedAssignedTo,
    }).catch((error) => req.log?.warn?.({ err: error, leadId: lead.id }, "lead: automatic item reservation skipped"));
  }

  // CRM-native enrichment: every newly created lead can be enriched in the
  // background without blocking the creation response and without triggering
  // unsolicited SDR outreach. Prospector keeps its own explicit dispatch rules.
  const hasEnrichmentSeed = Boolean(
    lead.documento || lead.empresa || lead.websiteUrl || lead.telefone || lead.email || lead.instagramHandle,
  );
  if (hasEnrichmentSeed) {
    enrichLead({
      leadId: lead.id,
      tenantId: lead.tenantId,
      log: req.log,
      allowAutoDispatch: false,
    }).catch((error) => req.log?.warn?.({ err: error, leadId: lead.id }, "lead: automatic enrichment skipped"));
  }

  res.status(201).json(lead);
});


// ── POST /leads/:id/enrich ────────────────────────────────────────────────
// Manual re-enrichment from the lead profile. This intentionally never starts
// an SDR conversation; it only refreshes intelligence and provenance.
router.post("/leads/:id/enrich", async (req, res) => {
  const id = String(req.params["id"]);
  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== lead.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.update(leadsTable)
    .set({ enrichmentStatus: "pending", updatedAt: new Date() })
    .where(and(eq(leadsTable.id, id), eq(leadsTable.tenantId, lead.tenantId)));

  enrichLead({
    leadId: id,
    tenantId: lead.tenantId,
    log: req.log,
    allowAutoDispatch: false,
  }).catch((error) => req.log?.warn?.({ err: error, leadId: id }, "lead: manual enrichment skipped"));

  res.status(202).json({ ok: true, status: "pending" });
});

const importLeadRowSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  telefone: z.string().optional().nullable(),
  documento: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  empresa: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  responsavel: z.string().optional().nullable(),
  // Colunas do CSV que não batem com nenhum campo padrão acima (ex:
  // "cargo", "origem_lead", "data_nascimento") — capturadas em vez de
  // descartadas, guardadas no metadata (jsonb) do lead. Chave = nome da
  // coluna do CSV, valor = texto da célula.
  camposExtras: z.record(z.string(), z.string()).optional().nullable(),
});

const importLeadsBodySchema = z.object({
  leads: z.array(importLeadRowSchema).min(1).max(500),
});

// ── POST /tenants/:tenantId/leads/bulk-reassign ────────────────────────────
router.post("/tenants/:tenantId/leads/bulk-reassign", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  if (!isAdmin) {
    res.status(403).json({ error: "Apenas administradores podem redistribuir leads." });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const { fromUserId, toUserId } = req.body as { fromUserId?: string; toUserId?: string };
  if (!fromUserId || !toUserId) {
    res.status(422).json({ error: "fromUserId e toUserId são obrigatórios." });
    return;
  }
  if (fromUserId === toUserId) {
    res.status(422).json({ error: "fromUserId e toUserId devem ser diferentes." });
    return;
  }

  const leadsUpdated = await db
    .update(leadsTable)
    .set({ assignedTo: toUserId })
    .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.assignedTo, fromUserId)))
    .returning({ id: leadsTable.id });

  const dealsUpdated = await db
    .update(dealsTable)
    .set({ assignedTo: toUserId })
    .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.assignedTo, fromUserId)))
    .returning({ id: dealsTable.id });

  res.json({ leadsReassigned: leadsUpdated.length, dealsReassigned: dealsUpdated.length });
});

router.post("/tenants/:tenantId/leads/import", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = importLeadsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { leads } = parsed.data;
  let imported = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i]!;
    try {
      const match = await findLeadByDedup(tenantId, row.telefone, row.documento, row.nome);
      if (match.found) {
        // Skip duplicate — log as warning but don't count as error
        errors.push({ row: i + 1, message: `Duplicate: matched by ${match.matchBy} to lead ${match.lead.id}` });
        continue;
      }
      // Responsável por nome (busca dentro do tenant, case-insensitive) — se
      // não vier na planilha ou não achar ninguém com esse nome, cai no
      // round-robin de sempre, não deixa o lead sem dono.
      let importAssignedTo: string | null = null;
      if (row.responsavel?.trim()) {
        const [vendedor] = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.tenantId, tenantId), ilike(usersTable.name, row.responsavel.trim())))
          .limit(1);
        importAssignedTo = vendedor?.id ?? null;
      }
      if (!importAssignedTo) importAssignedTo = await pickNextVendedor(tenantId, { location: row.endereco });

      const [importedLead] = await db.insert(leadsTable).values({
        tenantId,
        nome: row.nome,
        telefone: storePhone(row.telefone),
        documento: row.documento ? row.documento.replace(/\D/g, "") : null,
        email: row.email || null,
        endereco: row.endereco || null,
        instagramHandle: row.instagram || null,
        empresa: row.empresa || null,
        status: row.status?.trim() || "novo",
        possivelDuplicata: match.similar ? true : false,
        leadSimilarId: match.similar?.id ?? null,
        assignedTo: importAssignedTo,
        metadata: row.camposExtras && Object.keys(row.camposExtras).length > 0 ? row.camposExtras : null,
      }).returning();
      if (importedLead) {
        await db.insert(dealsTable).values({ tenantId, leadId: importedLead.id, titulo: importedLead.nome, etapa: "em_aquecimento", assignedTo: importAssignedTo });
        if (importAssignedTo) {
          recordResponsavelChange({
            leadId: importedLead.id,
            responsavelAnteriorId: null,
            responsavelNovoId: importAssignedTo,
            alteradoPorId: req.user?.sub ?? null,
            motivo: row.responsavel?.trim() ? "manual" : "automatico",
          }).catch(() => {});
        }
      }
      imported++;
    } catch (err) {
      errors.push({ row: i + 1, message: String(err) });
    }
  }

  res.json({ imported, errors });
});

router.get("/tenants/:tenantId/leads", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const isOwnTenant = req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
  const requestedFunctionId = typeof req.query["representationFunctionId"] === "string"
    ? String(req.query["representationFunctionId"])
    : null;
  const representativeAccess = isOwnTenant
    ? null
    : await findRepresentativeLeadAccess(req, tenantId, requestedFunctionId);

  if (!isOwnTenant && !representativeAccess) {
    res.status(403).json({ error: "Acesso negado à base desta empresa." });
    return;
  }

  const conditions = [
    eq(leadsTable.tenantId, tenantId),
    eq(leadsTable.possivelDuplicata, false),
  ];
  if (representativeAccess) {
    conditions.push(eq(leadsTable.representativeFunctionId, representativeAccess.id));
  }
  // Padrão: só leads ativos. incluirExcluidos=apenas mostra só os
  // excluídos (aba "Excluídos"); incluirExcluidos=incluir traz os dois
  // juntos. Sem o parâmetro, exclusão lógica fica invisível em todo o
  // resto do app (dashboard, pipeline, campanhas etc.) automaticamente,
  // já que praticamente tudo usa esse mesmo endpoint.
  const incluirExcluidos = req.query["incluirExcluidos"];
  if (incluirExcluidos === "apenas") {
    conditions.push(isNotNull(leadsTable.excluidoEm));
  } else if (incluirExcluidos !== "incluir") {
    conditions.push(isNull(leadsTable.excluidoEm));
  }
  // Mesmo padrão pra contato classificado como não-lead (D-003) -- sai
  // da pipeline/dashboard/campanhas por padrão, sem precisar filtrar em
  // cada tela que consome esse endpoint.
  const incluirNaoLeads = req.query["incluirNaoLeads"];
  if (incluirNaoLeads === "apenas") {
    conditions.push(isNotNull(leadsTable.naoLeadTipo));
  } else if (incluirNaoLeads !== "incluir") {
    conditions.push(isNull(leadsTable.naoLeadTipo));
  }
  if (!representativeAccess) {
    conditions.push(...buildUserFunctionFilter(req, leadsTable));
  }

  const leads = await db
    .select()
    .from(leadsTable)
    .where(and(...conditions))
    .orderBy(leadsTable.createdAt);
  res.json(leads);
});

router.get("/tenants/:tenantId/non-lead-classifications", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const [tenant] = await db.select({ classifications: tenantsTable.naoLeadClassificacoes })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(tenant.classifications?.length ? tenant.classifications : DEFAULT_NON_LEAD_CLASSIFICATIONS);
});

router.put("/tenants/:tenantId/non-lead-classifications", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  if (!isAdmin || (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId)) {
    res.status(403).json({ error: "Apenas administradores podem alterar classificações de Não Lead." });
    return;
  }
  const parsed = nonLeadClassificationsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const ids = parsed.data.classifications.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    res.status(422).json({ error: "Existem identificadores de classificação duplicados." });
    return;
  }
  const [tenant] = await db.update(tenantsTable)
    .set({ naoLeadClassificacoes: parsed.data.classifications, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId))
    .returning({ classifications: tenantsTable.naoLeadClassificacoes });
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(tenant.classifications);
});

// Classifica um lead como não-lead -- sai da pipeline, análise de churn
// e contagem de "novos" a partir de agora, mas continua acessível na
// aba "Não-Leads".
const classificarNaoLeadSchema = z.object({
  tipo: z.string().trim().min(2).max(50).regex(/^[a-z0-9_-]+$/),
  notas: z.string().optional(),
});

router.post("/leads/:id/classificar-nao-lead", async (req, res) => {
  const parsed = classificarNaoLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const id = String(req.params["id"]);
  const [existing] = await db.select({ id: leadsTable.id, tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [tenant] = await db.select({ classifications: tenantsTable.naoLeadClassificacoes })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, existing.tenantId))
    .limit(1);
  const classifications = tenant?.classifications?.length ? tenant.classifications : DEFAULT_NON_LEAD_CLASSIFICATIONS;
  const selectedClassification = classifications.find((item) => item.id === parsed.data.tipo && item.active !== false);
  if (!selectedClassification) {
    res.status(422).json({ error: "Classificação de Não Lead inválida ou inativa para este tenant." });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({
      naoLeadTipo: parsed.data.tipo,
      naoLeadNotas: parsed.data.notas ?? null,
      naoLeadClassificadoEm: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, id))
    .returning();

  // Achado real do Marcos: score de churn calculado ANTES da classificação
  // continuava aparecendo no dashboard mesmo depois de virar não-lead --
  // meu bloqueio anterior só impede análise NOVA, não limpa a que já
  // existia. Zera o score de churn na hora de classificar, pra sumir do
  // dashboard imediatamente, sem esperar um próximo ciclo de análise.
  await db
    .update(customerIntelligenceTable)
    .set({ churnRisk: null, churnRiskExplicacao: null, updatedAt: new Date() })
    .where(eq(customerIntelligenceTable.leadId, id));
  res.json(lead);
});

// Reverte a classificação -- volta a ser lead normal, reaparece na
// pipeline como "novo".
router.post("/leads/:id/reclassificar-como-lead", async (req, res) => {
  const id = String(req.params["id"]);
  const [existing] = await db.select({ id: leadsTable.id, tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({
      naoLeadTipo: null,
      naoLeadNotas: null,
      naoLeadClassificadoEm: null,
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, id))
    .returning();
  res.json(lead);
});

router.get("/leads/:id", async (req, res) => {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const isOwnTenant = req.user?.platformRole === "super_admin" || lead.tenantId === req.user?.tenantId;
  const representativeAccess = isOwnTenant
    ? null
    : await findRepresentativeLeadAccess(req, lead.tenantId, lead.representativeFunctionId);

  if (!isOwnTenant && (!representativeAccess || lead.representativeFunctionId !== representativeAccess.id)) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  if (!representativeAccess) {
    const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
    const userFn = req.user?.userFunction as UserFunction | undefined;
    if (!isAdmin && userFn === "vendedor" && lead.assignedTo !== req.user?.sub) {
      res.status(403).json({ error: "Access denied to this lead" });
      return;
    }
  }

  res.json(lead);
});

router.patch("/leads/:id", async (req, res) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo, representativeFunctionId: leadsTable.representativeFunctionId })
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const isOwnTenant2 = req.user?.platformRole === "super_admin" || existing.tenantId === req.user?.tenantId;
  const representativeAccess2 = isOwnTenant2
    ? null
    : await findRepresentativeLeadAccess(req, existing.tenantId, existing.representativeFunctionId);

  if (!isOwnTenant2 && (!representativeAccess2 || existing.representativeFunctionId !== representativeAccess2.id)) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  if (!representativeAccess2) {
    const isAdmin2 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
    const userFn2 = req.user?.userFunction as UserFunction | undefined;
    if (!isAdmin2 && userFn2 === "vendedor" && existing.assignedTo !== req.user?.sub) {
      res.status(403).json({ error: "Access denied to this lead" });
      return;
    }
  }

  if (parsed.data.representativeFunctionId !== undefined) {
    const isAdmin2 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
    if (!isOwnTenant2 || !isAdmin2) {
      res.status(403).json({ error: "Apenas administradores da empresa podem alterar a representação responsável." });
      return;
    }
    if (parsed.data.representativeFunctionId) {
      const representativeFunction = await validateRepresentativeFunction(existing.tenantId, parsed.data.representativeFunctionId);
      if (!representativeFunction) {
        res.status(422).json({ error: "Empresa representante inválida para este tenant." });
        return;
      }
    }
  }

  // Reatribuir o responsável do lead (do início ao fim, salvo intervenção)
  // é ação exclusiva do admin do tenant — um vendedor pode editar os próprios
  // leads normalmente, mas não pode se tirar (ou tirar outro) da carteira.
  if (!isAdmin2 && "assignedTo" in parsed.data && parsed.data.assignedTo !== existing.assignedTo) {
    res.status(403).json({ error: "Só o admin do tenant pode reatribuir o responsável pelo lead" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(leadsTable.id, existing.id))
    .returning();

  if ("assignedTo" in parsed.data && parsed.data.assignedTo && parsed.data.assignedTo !== existing.assignedTo) {
    recordResponsavelChange({
      leadId: existing.id,
      responsavelAnteriorId: existing.assignedTo,
      responsavelNovoId: parsed.data.assignedTo,
      alteradoPorId: req.user?.sub ?? null,
      motivo: "manual",
    }).catch(() => {});
  }

  // Feature store — captura o momento da mudança de status, primeiro passo
  // real de ML (nada bloqueia por causa disso, é melhor esforço).
  if (parsed.data.status) {
    captureLeadFeatureSnapshot(existing.tenantId, existing.id, "status_change", undefined, req.log).catch(() => {});
  }

  res.json(lead);
});

router.get("/leads/:id/responsavel-historico", async (req, res) => {
  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin3 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn3 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin3 && userFn3 === "vendedor" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const historico = await db
    .select({
      id: leadResponsavelHistoricoTable.id,
      responsavelAnteriorId: leadResponsavelHistoricoTable.responsavelAnteriorId,
      responsavelNovoId: leadResponsavelHistoricoTable.responsavelNovoId,
      alteradoPorId: leadResponsavelHistoricoTable.alteradoPorId,
      motivo: leadResponsavelHistoricoTable.motivo,
      criadoEm: leadResponsavelHistoricoTable.criadoEm,
    })
    .from(leadResponsavelHistoricoTable)
    .where(eq(leadResponsavelHistoricoTable.leadId, existing.id))
    .orderBy(desc(leadResponsavelHistoricoTable.criadoEm));

  res.json(historico);
});

router.delete("/leads/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin3 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn3 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin3 && userFn3 === "vendedor" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  // Exclusão lógica — o lead nunca sai do banco de verdade, só some das
  // listagens padrão e vira visível na aba "Excluídos" com o motivo.
  // Sem isso, um clique errado apagava o lead e todo o histórico
  // ligado a ele (prontuários, agendamentos, test-drives etc.) pra
  // sempre, sem chance de reverter nem registro de por que foi
  // excluído. A transação com as ~10 tabelas de FK RESTRICT que
  // existia aqui não é mais necessária — nada é de fato apagado.
  const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() || null : null;
  const [updated] = await db
    .update(leadsTable)
    .set({ excluidoEm: new Date(), motivoExclusao: motivo, updatedAt: new Date() })
    .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.tenantId, existing.tenantId)))
    .returning();

  res.status(200).json(updated);
});

// ── GET /tenants/:tenantId/leads/duplicates ─────────────────────────────────
// List leads flagged as "possible duplicates" for this tenant.
router.get("/tenants/:tenantId/leads/duplicates", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const flagged = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.tenantId, tenantId),
        eq(leadsTable.possivelDuplicata, true),
        ...buildUserFunctionFilter(req, leadsTable)
      )
    )
    .orderBy(leadsTable.createdAt);

  // Load similar lead for each
  const withSimilar = await Promise.all(
    flagged.map(async (lead) => {
      if (!lead.leadSimilarId) return { lead, similar: null };
      const [similar] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.id, lead.leadSimilarId), eq(leadsTable.tenantId, tenantId)))
        .limit(1);
      return { lead, similar: similar ?? null };
    })
  );

  res.json(withSimilar);
});

// ── POST /leads/:id/merge ─────────────────────────────────────────────────
// Merge a duplicate lead into the target lead. All related data (conversations,
// messages, deals, propostas, lead_proposals, activities, intelligence, tasks, logs, consents, briefings)
// is transferred to the target lead. The duplicate lead is then deleted.
const mergeLeadSchema = z.object({
  targetLeadId: z.string().uuid(),
});

router.post("/leads/:id/merge", async (req, res) => {
  const duplicateId = String(req.params.id);
  const parsed = mergeLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { targetLeadId } = parsed.data;

  if (duplicateId === targetLeadId) {
    res.status(422).json({ error: "Cannot merge a lead into itself" });
    return;
  }

  // Load both leads and verify same tenant + auth
  const [duplicate] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, duplicateId));
  const [target] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, targetLeadId));

  if (!duplicate || !target) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (duplicate.tenantId !== target.tenantId) {
    res.status(422).json({ error: "Leads belong to different tenants" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== duplicate.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Tenant sellers may only merge leads that are assigned to them
  const isAdminMerge = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFnMerge = req.user?.userFunction as UserFunction | undefined;
  if (!isAdminMerge && userFnMerge === "vendedor") {
    if (duplicate.assignedTo !== req.user?.sub || target.assignedTo !== req.user?.sub) {
      res.status(403).json({ error: "Access denied: seller can only merge leads assigned to them" });
      return;
    }
  }

  const tenantId = duplicate.tenantId;

    // Transfer all related data atomically
  const [mergedLead] = await db.transaction(async (tx) => {
    await tx
      .update(conversationsTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, duplicateId)));

    await tx
      .update(messagesTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(messagesTable.tenantId, tenantId), eq(messagesTable.leadId, duplicateId)));

    await tx
      .update(dealsTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, duplicateId)));

    await tx
      .update(propostasTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, duplicateId)));

    await tx
      .update(leadProposalsTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(leadProposalsTable.tenantId, tenantId), eq(leadProposalsTable.leadId, duplicateId)));

    await tx
      .update(activitiesTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(activitiesTable.tenantId, tenantId), eq(activitiesTable.leadId, duplicateId)));

    // customerIntelligenceTable.leadId is unique(): one row per lead.
    // If both leads have rows, we must delete the duplicate row before any
    // update to avoid a unique-constraint violation.
    const [targetIntel] = await tx
      .select({ id: customerIntelligenceTable.id })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tenantId), eq(customerIntelligenceTable.leadId, targetLeadId)))
      .limit(1);
    const [dupIntel] = await tx
      .select({ id: customerIntelligenceTable.id })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tenantId), eq(customerIntelligenceTable.leadId, duplicateId)))