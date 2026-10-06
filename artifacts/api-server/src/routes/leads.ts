import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
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
  attachmentFolderLocksTable,
  attachmentFolderAuditTable,
  attachmentFolderLockObjectsTable,
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
import { signAttachmentFolderUnlockToken } from "../lib/jwt.js";
import { attachmentUnlockCookieName, requestCanAccessLockedObject, syncProtectedObjectsForLead } from "../lib/attachment-folder-access.js";

const router: IRouter = Router();
const attachmentUnlockLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});

const attachmentFolderPathSchema = z.string().trim().min(1).max(240);
const attachmentFolderPasswordSchema = z.string().min(8).max(128);

async function getLeadForAttachmentFolder(req: any, res: any) {
  const [lead] = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      assignedTo: leadsTable.assignedTo,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return null;
  }

  const isOwnTenant = req.user?.platformRole === "super_admin" || req.user?.tenantId === lead.tenantId;
  if (!isOwnTenant) {
    res.status(403).json({ error: "Access denied to this lead" });
    return null;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin" || req.user?.userFunction === "administrador";
  const isSeller = req.user?.platformRole === "tenant_seller" || req.user?.userFunction === "vendedor";
  if (!isAdmin && isSeller && lead.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return null;
  }

  return { ...lead, isAdmin };
}


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

async function sanitizeProtectedLeadAttachments(req: any, lead: typeof leadsTable.$inferSelect) {
  const discovery = lead.discoveryData && typeof lead.discoveryData === "object" && !Array.isArray(lead.discoveryData)
    ? { ...(lead.discoveryData as Record<string, unknown>) }
    : null;
  if (!discovery) return lead;

  const rootValue = discovery["vendoraiAttachments"];
  if (!rootValue || typeof rootValue !== "object" || Array.isArray(rootValue)) return lead;
  const root = { ...(rootValue as Record<string, unknown>) };
  const files = Array.isArray(root["files"]) ? root["files"] as Array<Record<string, unknown>> : [];
  if (!files.length) return lead;

  const kept: Array<Record<string, unknown>> = [];
  const hiddenIds = new Set<string>();
  for (const file of files) {
    const storageUrl = typeof file["storageUrl"] === "string" ? file["storageUrl"] : "";
    if (storageUrl && !(await requestCanAccessLockedObject(req, lead.tenantId, storageUrl))) {
      if (typeof file["id"] === "string") hiddenIds.add(String(file["id"]));
      continue;
    }
    kept.push(file);
  }

  if (hiddenIds.size === 0) return lead;
  const overridesValue = root["overrides"];
  const overrides = overridesValue && typeof overridesValue === "object" && !Array.isArray(overridesValue)
    ? { ...(overridesValue as Record<string, unknown>) }
    : {};
  for (const id of hiddenIds) delete overrides[`lead:${id}`];

  root["files"] = kept;
  root["overrides"] = overrides;
  discovery["vendoraiAttachments"] = root;
  return { ...lead, discoveryData: discovery };
}

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

  res.status(201).json(lead);
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
  const tenantId = String(req.params["tenantId"]); // tenant-audit: reviewed immediate authenticated-tenant equality guard below
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
  const tenantId = String(req.params["tenantId"]); // tenant-audit: reviewed admin role plus authenticated-tenant equality guard below
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

  const classifiedAt = new Date();
  const [lead] = await db
    .update(leadsTable)
    .set({
      naoLeadTipo: parsed.data.tipo,
      naoLeadNotas: parsed.data.notas ?? null,
      naoLeadClassificadoEm: classifiedAt,
      updatedAt: classifiedAt,
    })
    .where(eq(leadsTable.id, id))
    .returning();

  // Não Lead não deve ficar misturado na pipeline comercial nem no aquecimento
  // comum. Preservamos o mesmo negócio/histórico, mas movemos os negócios
  // comerciais ativos para a aba específica "Não Leads".
  await db
    .update(dealsTable)
    .set({
      etapa: "em_aquecimento",
      aquecimentoTipo: "nao_cliente",
      relationshipStage: "aquecimento_nao_lead",
      updatedAt: classifiedAt,
    })
    .where(and(
      eq(dealsTable.tenantId, existing.tenantId),
      eq(dealsTable.leadId, id),
      inArray(dealsTable.etapa, [
        "em_aquecimento",
        "novo",
        "qualificado",
        "proposta",
        "negociacao",
        "conferencia_estoque",
        "contrato",
      ]),
    ));

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

// Reverte a classificação -- volta a ser lead normal e retorna à
// aba de Leads em aquecimento para retomada comercial explícita.
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

  const reclassifiedAt = new Date();
  const [lead] = await db
    .update(leadsTable)
    .set({
      naoLeadTipo: null,
      naoLeadNotas: null,
      naoLeadClassificadoEm: null,
      updatedAt: reclassifiedAt,
    })
    .where(eq(leadsTable.id, id))
    .returning();

  // Ao voltar a ser Lead, sai da aba "Não Leads" e retorna ao aquecimento
  // normal. A retomada comercial continua sendo uma ação explícita do usuário.
  await db
    .update(dealsTable)
    .set({
      etapa: "em_aquecimento",
      aquecimentoTipo: "nao_cliente",
      relationshipStage: "aquecimento_lead",
      updatedAt: reclassifiedAt,
    })
    .where(and(
      eq(dealsTable.tenantId, existing.tenantId),
      eq(dealsTable.leadId, id),
      eq(dealsTable.relationshipStage, "aquecimento_nao_lead"),
    ));

  res.json(lead);
});

router.get("/leads/:id/attachment-folder-locks", async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;

  const rows = await db
    .select({
      folderPath: attachmentFolderLocksTable.folderPath,
      unlockMinutes: attachmentFolderLocksTable.unlockMinutes,
      createdAt: attachmentFolderLocksTable.createdAt,
      updatedAt: attachmentFolderLocksTable.updatedAt,
    })
    .from(attachmentFolderLocksTable)
    .where(and(
      eq(attachmentFolderLocksTable.tenantId, lead.tenantId),
      eq(attachmentFolderLocksTable.leadId, lead.id),
    ));

  res.json({
    locks: rows.map((row) => ({ ...row, locked: true })),
    canManage: lead.isAdmin,
  });
});

router.put("/leads/:id/attachment-folder-lock", async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;
  if (!lead.isAdmin) {
    res.status(403).json({ error: "Somente o administrador do tenant pode proteger pastas." });
    return;
  }

  const parsed = z.object({
    folderPath: attachmentFolderPathSchema,
    password: attachmentFolderPasswordSchema,
    unlockMinutes: z.number().int().min(1).max(240).optional().default(15),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Informe uma pasta válida e uma senha com pelo menos 8 caracteres." });
    return;
  }

  const folderPath = parsed.data.folderPath.split("/").map((p) => p.trim()).filter(Boolean).join(" / ");
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const now = new Date();

  const [existing] = await db
    .select({ id: attachmentFolderLocksTable.id })
    .from(attachmentFolderLocksTable)
    .where(and(
      eq(attachmentFolderLocksTable.tenantId, lead.tenantId),
      eq(attachmentFolderLocksTable.leadId, lead.id),
      eq(attachmentFolderLocksTable.folderPath, folderPath),
    ))
    .limit(1);

  if (existing) {
    await db.update(attachmentFolderLocksTable)
      .set({
        passwordHash,
        unlockMinutes: parsed.data.unlockMinutes,
        updatedBy: req.user?.sub ?? null,
        updatedAt: now,
      })
      .where(eq(attachmentFolderLocksTable.id, existing.id));
  } else {
    await db.insert(attachmentFolderLocksTable).values({
      tenantId: lead.tenantId,
      leadId: lead.id,
      folderPath,
      passwordHash,
      unlockMinutes: parsed.data.unlockMinutes,
      createdBy: req.user?.sub ?? null,
      updatedBy: req.user?.sub ?? null,
    });
  }

  await syncProtectedObjectsForLead(lead.tenantId, lead.id);

  await db.insert(attachmentFolderAuditTable).values({
    tenantId: lead.tenantId,
    leadId: lead.id,
    folderPath,
    actorUserId: req.user?.sub ?? null,
    action: existing ? "password_changed" : "locked",
  });

  res.json({ folderPath, locked: true, unlockMinutes: parsed.data.unlockMinutes });
});

router.delete("/leads/:id/attachment-folder-lock", async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;
  if (!lead.isAdmin) {
    res.status(403).json({ error: "Somente o administrador do tenant pode remover a proteção." });
    return;
  }

  const parsed = z.object({ folderPath: attachmentFolderPathSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Pasta inválida." });
    return;
  }
  const folderPath = parsed.data.folderPath.split("/").map((p) => p.trim()).filter(Boolean).join(" / ");

  await db.delete(attachmentFolderLocksTable).where(and(
    eq(attachmentFolderLocksTable.tenantId, lead.tenantId),
    eq(attachmentFolderLocksTable.leadId, lead.id),
    eq(attachmentFolderLocksTable.folderPath, folderPath),
  ));

  await db.insert(attachmentFolderAuditTable).values({
    tenantId: lead.tenantId,
    leadId: lead.id,
    folderPath,
    actorUserId: req.user?.sub ?? null,
    action: "lock_removed",
  });

  res.status(204).send();
});

router.post("/leads/:id/attachment-folder-unlock", attachmentUnlockLimiter, async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;

  const parsed = z.object({
    folderPath: attachmentFolderPathSchema,
    password: z.string().min(1).max(128),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Informe a senha da pasta." });
    return;
  }
  const folderPath = parsed.data.folderPath.split("/").map((p) => p.trim()).filter(Boolean).join(" / ");

  const [lock] = await db
    .select()
    .from(attachmentFolderLocksTable)
    .where(and(
      eq(attachmentFolderLocksTable.tenantId, lead.tenantId),
      eq(attachmentFolderLocksTable.leadId, lead.id),
      eq(attachmentFolderLocksTable.folderPath, folderPath),
    ))
    .limit(1);

  if (!lock) {
    res.json({ folderPath, unlocked: true, expiresAt: null });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.password, lock.passwordHash);
  await db.insert(attachmentFolderAuditTable).values({
    tenantId: lead.tenantId,
    leadId: lead.id,
    folderPath,
    actorUserId: req.user?.sub ?? null,
    action: valid ? "unlocked" : "unlock_failed",
  });

  if (!valid) {
    res.status(401).json({ error: "Senha incorreta." });
    return;
  }

  const expiresSeconds = lock.unlockMinutes * 60;
  const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString();
  const token = signAttachmentFolderUnlockToken({
    purpose: "attachment_folder_unlock",
    sub: String(req.user?.sub ?? ""),
    tenantId: lead.tenantId,
    leadId: lead.id,
    lockId: lock.id,
    folderPath,
  }, expiresSeconds);
  res.cookie(attachmentUnlockCookieName(lock.id), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: expiresSeconds * 1000,
    path: "/api",
  });
  res.json({ folderPath, unlocked: true, expiresAt });
});

router.post("/leads/:id/attachment-folder-lock/sync", async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;

  const parsed = z.object({
    folderPath: attachmentFolderPathSchema.optional(),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: "Dados de sincronização inválidos." });
    return;
  }

  await syncProtectedObjectsForLead(lead.tenantId, lead.id);
  res.json({ synced: true, folderPath: parsed.data.folderPath ?? null });
});

router.post("/leads/:id/attachment-folder-lock/lock-now", async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;
  const parsed = z.object({ folderPath: attachmentFolderPathSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Pasta inválida." });
    return;
  }
  const folderPath = parsed.data.folderPath.split("/").map((p) => p.trim()).filter(Boolean).join(" / ");
  const [lock] = await db.select().from(attachmentFolderLocksTable).where(and(
    eq(attachmentFolderLocksTable.tenantId, lead.tenantId),
    eq(attachmentFolderLocksTable.leadId, lead.id),
    eq(attachmentFolderLocksTable.folderPath, folderPath),
  )).limit(1);
  if (!lock) {
    res.status(404).json({ error: "A pasta não está protegida." });
    return;
  }
  res.clearCookie(attachmentUnlockCookieName(lock.id), { path: "/api" });
  res.status(204).send();
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

  res.json(await sanitizeProtectedLeadAttachments(req, lead));
});

router.patch("/leads/:id", async (req, res) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });