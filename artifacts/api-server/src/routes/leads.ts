import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { and, eq, inArray, desc, ilike, isNull, isNotNull, sql } from "drizzle-orm";
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
  dealTenantParticipationsTable,
} from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { buildUserFunctionFilter, requireAdminOrUserFunction, type UserFunction } from "../middlewares/auth.js";
import { callOpenAI } from "../lib/ai-gateway.js";
import { pickNextLeadResponsibility } from "../lib/round-robin.js";
import { geocodeAddressWithTimeout } from "../lib/geocoding.js";
import { recordResponsavelChange } from "../lib/leadResponsavelHistorico.js";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";
import { getActiveCatalogPreview, compactCatalogNames } from "../lib/catalog-readiness.js";
import { reserveUniqueVehicle } from "../services/vehicle-reservation.js";
import { reserveUniqueItem } from "../services/item-reservation.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { signAttachmentFolderUnlockToken } from "../lib/jwt.js";
import { leadRegistrationMetadata, normalizeInstagramHandle, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { attachmentUnlockCookieName,
  isAttachmentFolderSchemaMissingError, requestCanAccessLockedObject, syncProtectedObjectsForLead } from "../lib/attachment-folder-access.js";

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
  // Idempotência de cadastro manual: chave única por solicitação, associada ao autor e ao conteúdo.
  const registrationRequestId = typeof data.metadata?.registrationRequestId === "string"
    && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.metadata.registrationRequestId)
      ? data.metadata.registrationRequestId.toLowerCase() : null;
  const registrationActorId = req.user?.sub ?? req.user?.id ?? null;
  const registrationPayloadHash = registrationRequestId
    ? createHash("sha256").update(JSON.stringify(data)).digest("hex") : null;
  if (registrationRequestId && !registrationActorId) {
    res.status(403).json({ error: "Autor do cadastro não identificado." });
    return;
  }
  const replayFilter = registrationRequestId
    ? and(eq(leadsTable.tenantId, data.tenantId),
        sql`${leadsTable.metadata}->>'registrationRequestId' = ${registrationRequestId}`) : undefined;
  if (replayFilter) {
    const [previous] = await db.select().from(leadsTable).where(replayFilter).limit(1);
    if (previous) {
      if (previous.metadata?.registrationActorId !== registrationActorId
        || previous.metadata?.registrationPayloadHash !== registrationPayloadHash) {
        res.status(409).json({ code: "IDEMPOTENCY_KEY_REUSED", error: "Identificador já usado em outro cadastro." });
        return;
      }
      res.status(200).json(previous);
      return;
    }
  }

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
  let resolvedRepresentativeFunctionId: string | null = data.representativeFunctionId ?? null;
  let geocoded: { lat: number; lng: number } | null = null;
  if (resolvedRepresentativeFunctionId) {
    resolvedAssignedTo = null;
  } else if (isSellerCreator) {
    resolvedAssignedTo = req.user?.sub ?? null;
  } else if (data.assignedTo) {
    resolvedAssignedTo = data.assignedTo;
  } else {
    // A distribuição automática usa um único pool lógico: usuários internos
    // e empresas/equipes externas comerciais configuradas disputam o lead
    // pelos mesmos critérios de segmento, território, raio e rodízio.
    geocoded = data.endereco ? await geocodeAddressWithTimeout(data.endereco) : null;
    const assignment = await pickNextLeadResponsibility(data.tenantId, {
      segmento: data.mercadoSegmento,
      location: data.endereco,
      lat: geocoded?.lat ?? null,
      lng: geocoded?.lng ?? null,
    });
    resolvedAssignedTo = assignment?.kind === "user" ? assignment.id : null;
    resolvedRepresentativeFunctionId = assignment?.kind === "external_company" ? assignment.id : null;
  }

  if (!resolvedAssignedTo && !resolvedRepresentativeFunctionId) {
    res.status(422).json({
      error: "Responsável obrigatório. Selecione um usuário da equipe, uma empresa representante ou configure a distribuição automática com ao menos um responsável elegível.",
    });
    return;
  }

  // Lead and its automatic pipeline deal either persist together or roll back together.
  const creation = await db.transaction(async (tx) => {
    if (registrationRequestId && replayFilter) {
      // Serialize across processes and browser sessions; replay reads the committed row.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.tenantId}), hashtext(${registrationRequestId}))`);
      const [previous] = await tx.select().from(leadsTable).where(replayFilter).limit(1);
      if (previous) {
        if (previous.metadata?.registrationActorId !== registrationActorId
          || previous.metadata?.registrationPayloadHash !== registrationPayloadHash)
          throw Object.assign(new Error("Identificador já usado em outro cadastro."), { status: 409 });
        return { lead: previous, replay: true };
      }
    }
  const [lead] = await tx.insert(leadsTable).values({
    ...data,
    nome: normalizeLeadName(data.nome, "Lead"),
    email: normalizeLeadEmail(data.email),
    instagramHandle: normalizeInstagramHandle(data.instagramHandle),
    assignedTo: resolvedAssignedTo,
    representativeFunctionId: resolvedRepresentativeFunctionId,
    latitude: geocoded?.lat ?? null,
    longitude: geocoded?.lng ?? null,
    telefone: storePhone(data.telefone),
    documento: data.documento ? data.documento.replace(/\D/g, "") : data.documento,
    metadata: leadRegistrationMetadata(data.metadata, {
      entryChannel: data.source === "whatsapp"
        ? "whatsapp"
        : data.source === "instagram"
          ? "instagram"
          : data.source === "email"
            ? "email"
            : data.source?.includes("site") || data.source?.includes("website")
              ? "site"
              : data.source?.includes("prospec")
                ? "prospeccao"
                : data.source?.includes("indicacao")
                  ? "parceiro"
                  : "manual",
      entrySource: data.source || "manual",
    }),
    // Stored values below are derived server-side, never trusted from request metadata.
    ...(registrationRequestId ? { metadata: {
      ...leadRegistrationMetadata(data.metadata, {
        entryChannel: data.source === "whatsapp" ? "whatsapp" :
          data.source === "instagram" ? "instagram" :
          data.source === "email" ? "email" :
          data.source?.includes("site") || data.source?.includes("website") ? "site" :
          data.source?.includes("prospec") ? "prospeccao" :
          data.source?.includes("indicacao") ? "parceiro" : "manual",
        entrySource: data.source || "manual",
      }),
      registrationRequestId, registrationActorId, registrationPayloadHash,
    }} : {}),
    possivelDuplicata: false,
    leadSimilarId: null,
  } as any).returning();

  // Auto-create deal in pipeline (aquecimento) unless lead is pipeline-exempt
  if (!lead.pipelineExempt) {
    await tx.insert(dealsTable).values({
      tenantId: lead.tenantId,
      leadId: lead.id,
      titulo: lead.nome,
      etapa: "em_aquecimento",
      assignedTo: resolvedAssignedTo,
    });
  }

    return { lead, replay: false };
  });
  const lead = creation.lead;
  if (creation.replay) {
    res.status(200).json(lead);
    return;
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
      if (!importAssignedTo) {
        throw new Error("Responsável obrigatório: nenhum usuário elegível foi encontrado para este lead.");
      }

      const [importedLead] = await db.insert(leadsTable).values({
        tenantId,
        nome: normalizeLeadName(row.nome, "Lead importado"),
        telefone: storePhone(row.telefone),
        documento: row.documento ? row.documento.replace(/\D/g, "") : null,
        email: normalizeLeadEmail(row.email),
        endereco: row.endereco?.trim() || null,
        instagramHandle: normalizeInstagramHandle(row.instagram),
        empresa: row.empresa?.trim() || null,
        status: row.status?.trim() || "novo",
        source: "importacao_planilha",
        possivelDuplicata: match.similar ? true : false,
        leadSimilarId: match.similar?.id ?? null,
        assignedTo: importAssignedTo,
        metadata: leadRegistrationMetadata(row.camposExtras, {
          entryChannel: "importacao",
          entrySource: "importacao_planilha",
        }),
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

  if (isOwnTenant) {
    const sharedRows = await db.select({
      lead: leadsTable,
      operationalUserId: dealTenantParticipationsTable.operationalUserId,
      participationId: dealTenantParticipationsTable.id,
      ownerTenantId: dealTenantParticipationsTable.ownerTenantId,
    })
      .from(dealTenantParticipationsTable)
      .innerJoin(dealsTable, eq(dealsTable.id, dealTenantParticipationsTable.dealId))
      .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
      .where(and(
        eq(dealTenantParticipationsTable.partnerTenantId, tenantId),
        eq(dealTenantParticipationsTable.status, "active"),
        eq(leadsTable.possivelDuplicata, false),
        incluirExcluidos === "apenas" ? isNotNull(leadsTable.excluidoEm) : incluirExcluidos === "incluir" ? sql`true` : isNull(leadsTable.excluidoEm),
        incluirNaoLeads === "apenas" ? isNotNull(leadsTable.naoLeadTipo) : incluirNaoLeads === "incluir" ? sql`true` : isNull(leadsTable.naoLeadTipo),
      ));

    const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
    const currentUserId = String(req.user?.sub ?? "");
    const sharedLeads = sharedRows
      .filter((row) => isAdmin || !row.operationalUserId || row.operationalUserId === currentUserId)
      .map((row) => ({
        ...row.lead,
        sharedParticipationId: row.participationId,
        sharedOriginTenantId: row.ownerTenantId,
        sharedReadOnly: true,
      }));

    const ownIds = new Set(leads.map((lead) => lead.id));
    return res.json([...leads, ...sharedLeads.filter((lead) => !ownIds.has(lead.id))]);
  }

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

router.delete("/leads/:id/attachments/:attachmentId", async (req, res) => {
  const access = await getLeadForAttachmentFolder(req, res);
  if (!access) return;

  const attachmentId = String(req.params.attachmentId);
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, access.id))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const discovery = lead.discoveryData && typeof lead.discoveryData === "object" && !Array.isArray(lead.discoveryData)
    ? { ...(lead.discoveryData as Record<string, unknown>) }
    : {};
  const rootValue = discovery["vendoraiAttachments"];
  const root = rootValue && typeof rootValue === "object" && !Array.isArray(rootValue)
    ? { ...(rootValue as Record<string, unknown>) }
    : {};
  const files = Array.isArray(root["files"]) ? root["files"] as Array<Record<string, unknown>> : [];
  const file = files.find((item) => String(item["id"] ?? "") === attachmentId);

  if (!file) {
    res.status(404).json({ error: "Arquivo não encontrado" });
    return;
  }

  const storageUrl = typeof file["storageUrl"] === "string" ? file["storageUrl"] : "";
  if (storageUrl.startsWith("/objects/")) {
    try {
      const storage = new ObjectStorageService();
      const objectFile = await storage.getObjectEntityFile(storageUrl);
      await objectFile.delete();
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        req.log.error({ err: error, leadId: access.id, attachmentId, storageUrl }, "lead-attachments: failed to delete physical file");
        res.status(500).json({ error: "Não foi possível excluir o arquivo" });
        return;
      }
    }
  }

  const overridesValue = root["overrides"];
  const overrides = overridesValue && typeof overridesValue === "object" && !Array.isArray(overridesValue)
    ? { ...(overridesValue as Record<string, unknown>) }
    : {};
  delete overrides[`lead:${attachmentId}`];

  root["files"] = files.filter((item) => String(item["id"] ?? "") !== attachmentId);
  root["overrides"] = overrides;
  discovery["vendoraiAttachments"] = root;

  const [updated] = await db
    .update(leadsTable)
    .set({ discoveryData: discovery, updatedAt: new Date() })
    .where(eq(leadsTable.id, access.id))
    .returning();

  await syncProtectedObjectsForLead(access.tenantId, access.id);
  res.json({ deleted: true, attachmentId, lead: updated });
});

router.get("/leads/:id/attachment-folder-locks", async (req, res) => {
  const lead = await getLeadForAttachmentFolder(req, res);
  if (!lead) return;

  try {
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
  } catch (error) {
    if (!isAttachmentFolderSchemaMissingError(error)) throw error;
    res.json({
      locks: [],
      canManage: false,
      schemaPending: true,
    });
  }
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

  // Negócios compartilhados concedem acesso ao mesmo lead para o tenant
  // participante. Isso torna o fluxo realmente bidirecional sem copiar o lead
  // e sem depender de a empresa de origem ter previamente criado uma função
  // externa específica para o outro sentido da parceria.
  let sharedDealAccess = false;
  if (!isOwnTenant && !representativeAccess && req.user?.tenantId) {
    const sharedRows = await db.select({
      operationalUserId: dealTenantParticipationsTable.operationalUserId,
    })
      .from(dealTenantParticipationsTable)
      .innerJoin(dealsTable, eq(dealsTable.id, dealTenantParticipationsTable.dealId))
      .where(and(
        eq(dealsTable.leadId, lead.id),
        eq(dealTenantParticipationsTable.partnerTenantId, req.user.tenantId),
        eq(dealTenantParticipationsTable.status, "active"),
      ));

    const isParticipantAdmin = req.user?.platformRole === "tenant_admin";
    sharedDealAccess = sharedRows.some((row) =>
      isParticipantAdmin || !row.operationalUserId || row.operationalUserId === req.user?.sub
    );
  }

  if (!isOwnTenant && (!representativeAccess || lead.representativeFunctionId !== representativeAccess.id) && !sharedDealAccess) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  if (!representativeAccess && !sharedDealAccess) {
    const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
    // A leitura por ID deve respeitar a mesma carteira da listagem, para
    // todas as funções humanas (não apenas a função "vendedor").
    if (!isAdmin && lead.assignedTo !== req.user?.sub) {
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

  const isAdmin2 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";

  if (!representativeAccess2) {
    // Alinhar mutação à regra de carteira para todas as funções não administrativas.
    if (!isAdmin2 && existing.assignedTo !== req.user?.sub) {
      res.status(403).json({ error: "Access denied to this lead" });
      return;
    }
  }

  if (parsed.data.representativeFunctionId !== undefined) {
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

  if ("discoveryData" in parsed.data) {
    await syncProtectedObjectsForLead(existing.tenantId, existing.id);
  }

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
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo, metadata: leadsTable.metadata })
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

  const isAdmin3 = req.user?.platformRole === "super_admin"
    || req.user?.platformRole === "tenant_admin"
    || req.user?.userFunction === "administrador";
  if (!isAdmin3) {
    res.status(403).json({ error: "Apenas administradores do tenant podem excluir leads." });
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
    .set({
      excluidoEm: new Date(),
      motivoExclusao: motivo,
      metadata: {
        ...((existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata))
          ? existing.metadata as Record<string, unknown>
          : {}),
        leadDeletion: {
          deletedBy: req.user?.sub ?? null,
          deletedAt: new Date().toISOString(),
          reason: motivo,
        },
      },
      updatedAt: new Date(),
    })
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
      .limit(1);
    if (dupIntel) {
      if (targetIntel) {
        // Target already has intel — delete duplicate row and keep target.
        await tx
          .delete(customerIntelligenceTable)
          .where(eq(customerIntelligenceTable.id, dupIntel.id));
      } else {
        // Target has no intel — reassign duplicate row to target.
        await tx
          .update(customerIntelligenceTable)
          .set({ leadId: targetLeadId, updatedAt: new Date() })
          .where(eq(customerIntelligenceTable.id, dupIntel.id));
      }
    }

    await tx
      .update(agentTasksTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.leadId, duplicateId)));

    await tx
      .update(agentActionsLogTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(agentActionsLogTable.tenantId, tenantId), eq(agentActionsLogTable.leadId, duplicateId)));

    await tx
      .update(consentsTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(consentsTable.tenantId, tenantId), eq(consentsTable.leadId, duplicateId)));

    await tx
      .update(intelligenceAnalysisLogTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(intelligenceAnalysisLogTable.tenantId, tenantId), eq(intelligenceAnalysisLogTable.leadId, duplicateId)));

    await tx
      .update(leadBriefingsTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(leadBriefingsTable.tenantId, tenantId), eq(leadBriefingsTable.leadId, duplicateId)));

    // Delete the duplicate
    await tx.delete(leadsTable).where(eq(leadsTable.id, duplicateId));

    // Return the merged (target) lead
    return tx.select().from(leadsTable).where(eq(leadsTable.id, targetLeadId)).limit(1);
  });

  res.json({
    success: true,
    lead: mergedLead,
    duplicateId,
    transferredTables: [
      "conversations",
      "messages",
      "deals",
      "propostas",
      "lead_proposals",
      "activities",
      "customer_intelligence",
      "agent_tasks",
      "agent_actions_log",
      "consents",
      "intelligence_analysis_log",
      "lead_briefings",
    ],
  });
});

// ── POST /leads/:id/dismiss-duplicate ─────────────────────────────────
// Remove the duplicate flag from a lead (user decided to keep them separate).
router.post("/leads/:id/dismiss-duplicate", async (req, res) => {
  const leadId = String(req.params.id);

  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin4 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn4 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin4 && userFn4 === "vendedor" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({ possivelDuplicata: false, leadSimilarId: null, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))
    .returning();

  res.json({ success: true, lead });
});

// ── GET /tenants/:tenantId/lead-briefings ─────────────────────────────────
router.get("/tenants/:tenantId/lead-briefings", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const briefings = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.tenantId, tenantId));

  res.json(briefings);
});

// ── GET /leads/:leadId/briefing ────────────────────────────────────────────
router.get("/leads/:leadId/briefing", async (req, res) => {
  const leadId = String(req.params.leadId);

  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && lead.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const [briefing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, leadId));

  res.json(briefing ?? null);
});

// ── PUT /leads/:leadId/briefing ────────────────────────────────────────────
// Upsert: create if not exists, update if exists
router.put("/leads/:leadId/briefing", async (req, res) => {
  const leadId = String(req.params.leadId);

  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && lead.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const parsed = updateLeadBriefingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const tenantId = lead.tenantId;
  const approachedBy = data.approachedBy ?? req.user?.sub ?? null;

  const [existing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, leadId));

  if (existing) {
    const [updated] = await db
      .update(leadBriefingsTable)
      .set({
        channelsUsed: data.channelsUsed ?? existing.channelsUsed,
        contactType: data.contactType ?? existing.contactType,
        approachedBy: approachedBy ?? existing.approachedBy,
        contactDate: data.contactDate ?? existing.contactDate,
        situationAnswers: data.situationAnswers ?? existing.situationAnswers,
        problemAnswers: data.problemAnswers ?? existing.problemAnswers,
        problemMinimized: data.problemMinimized ?? existing.problemMinimized,
        implicationAnswers: data.implicationAnswers ?? existing.implicationAnswers,
        implicationEstimatedValue: data.implicationEstimatedValue ?? existing.implicationEstimatedValue,
        needAnswers: data.needAnswers ?? existing.needAnswers,
        needThermometer: data.needThermometer ?? existing.needThermometer,
        objections: data.objections ?? existing.objections,
        prospectSize: data.prospectSize ?? existing.prospectSize,
        presentationSent: data.presentationSent ?? existing.presentationSent,
        presentationSentDate: data.presentationSentDate ?? existing.presentationSentDate,
        presentationLink: data.presentationLink ?? existing.presentationLink,
        nextStepType: data.nextStepType ?? existing.nextStepType,
        nextStepDate: data.nextStepDate ?? existing.nextStepDate,
        freeNotes: data.freeNotes ?? existing.freeNotes,
        journeyStage: data.journeyStage ?? existing.journeyStage,
        journeyChecklist: data.journeyChecklist ?? existing.journeyChecklist,
        updatedAt: new Date(),
      })
      .where(eq(leadBriefingsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(leadBriefingsTable)
      .values({
        tenantId,
        leadId,
        channelsUsed: data.channelsUsed,
        contactType: data.contactType,
        approachedBy,
        contactDate: data.contactDate,
        situationAnswers: data.situationAnswers,
        problemAnswers: data.problemAnswers,
        problemMinimized: data.problemMinimized,
        implicationAnswers: data.implicationAnswers,
        implicationEstimatedValue: data.implicationEstimatedValue,
        needAnswers: data.needAnswers,
        needThermometer: data.needThermometer,
        objections: data.objections,
        prospectSize: data.prospectSize,
        presentationSent: data.presentationSent,
        presentationSentDate: data.presentationSentDate,
        presentationLink: data.presentationLink,
        nextStepType: data.nextStepType,
        nextStepDate: data.nextStepDate,
        freeNotes: data.freeNotes,
        journeyStage: data.journeyStage,
        journeyChecklist: data.journeyChecklist,
      })
      .returning();
    res.status(201).json(created);
  }
});

// ── POST /leads/:leadId/briefing/generate-questions ─────────────────────────
// Uses AI to generate SPIN questions deeply tailored to the lead's specific
// business type and recent conversation context.
router.post("/leads/:leadId/briefing/generate-questions", async (req, res) => {
  const leadId = String(req.params.leadId);

  const [lead] = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      mercadoSegmento: leadsTable.mercadoSegmento,
      objetivo: leadsTable.objetivo,
      assignedTo: leadsTable.assignedTo,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead) {
    res.status(404).json({ error: "Lead não encontrado" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const tenantId = lead.tenantId;

  const [profile, recentMessages, catalogPreview] = await Promise.all([
    db
      .select({
        nomeFantasia: businessProfilesTable.nomeFantasia,
        vertical: businessProfilesTable.vertical,
        metodoVendas: businessProfilesTable.metodoVendas,
        diferenciais: businessProfilesTable.diferenciais,
        publicoAlvo: businessProfilesTable.publicoAlvo,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .then((rows) => rows[0] ?? null),
    db
      .select({ direcao: messagesTable.direcao, conteudo: messagesTable.conteudo })
      .from(messagesTable)
      .where(and(eq(messagesTable.leadId, leadId), eq(messagesTable.tenantId, tenantId)))
      .orderBy(desc(messagesTable.createdAt))
      .limit(12),
    getActiveCatalogPreview(tenantId, 5),
  ]);

  const metodoMap: Record<string, string> = {
    consultiva: "Venda Consultiva (foco na dor e contexto do cliente)",
    spin: "SPIN Selling (situação, problema, implicação, necessidade-solução)",
    challenger: "Challenger Sale (provocação, ensino, customização)",
    social: "Social Selling (relacionamento e conteúdo)",
    outbound: "Outbound (prospecção ativa)",
    inbound: "Inbound (educação e conteúdo)",
  };
  const abordagem = metodoMap[(profile?.metodoVendas ?? "")] ?? (profile?.metodoVendas ?? "Venda Consultiva");

  const produtosDesc = compactCatalogNames(catalogPreview, 5).join(", ") || null;

  const conversaTexto = recentMessages.length
    ? recentMessages
        .reverse()
        .map((m) => `[${m.direcao === "entrada" ? "Cliente" : "Vendedor"}]: ${m.conteudo}`)
        .join("\n")
    : null;

  const segmento = lead.mercadoSegmento?.trim() || lead.objetivo?.trim() || null;

  const systemPrompt = `Você é um especialista em vendas consultivas com profundo conhecimento em diferentes setores de negócio.
Sua tarefa é gerar perguntas de briefing SPIN altamente específicas para o tipo de negócio do CLIENTE — não perguntas genéricas sobre atendimento ou canais.

REGRAS OBRIGATÓRIAS:
1. As perguntas devem refletir o COTIDIANO OPERACIONAL real do segmento do cliente informado abaixo — nunca invente ou assuma um segmento diferente do que foi passado.
2. Se o segmento do cliente vier como "não identificado" (campo vazio no CRM), NÃO assuma nenhum setor específico. Em vez disso, gere perguntas de DESCOBERTA que ajudem o vendedor a entender rapidamente que tipo de negócio é esse — como funciona a operação, quem são os clientes dele, qual o principal processo do dia a dia — pra só então, numa próxima rodada, aprofundar no segmento certo.
3. NÃO pergunte sobre canais de atendimento (WhatsApp, Instagram etc.) — isso já está em outra parte do formulário.
4. NÃO use linguagem corporativa genérica. As perguntas devem soar naturais numa conversa de WhatsApp ou ligação.
5. Cada pergunta deve revelar algo diferente e complementar — evite variações da mesma dor.
6. Use o contexto da conversa para tornar as perguntas ainda mais específicas ao momento atual do cliente.`;

  const userPrompt = `## Cliente
Empresa/Nome: ${lead.empresa ?? lead.nome ?? "não informado"}
Segmento: ${segmento ?? "não identificado — peça pro vendedor descobrir isso na conversa, não assuma um setor"}
Objetivo registrado: ${lead.objetivo ?? "não informado"}

## Empresa vendedora
Nome: ${profile?.nomeFantasia ?? "nossa empresa"}
Segmento: ${profile?.vertical ?? "não especificado"}
Método de vendas: ${abordagem}
${produtosDesc ? `Catálogo oficial ativo: ${produtosDesc}` : ""}
${profile?.diferenciais ? `Diferenciais: ${profile.diferenciais}` : ""}

${conversaTexto ? `## Trechos recentes da conversa com o cliente\n${conversaTexto}\n` : ""}

## Tarefa
${segmento
  ? `Gere exatamente 3 perguntas para cada bloco SPIN, específicas para um negócio do tipo "${segmento}". As perguntas devem explorar a realidade operacional, as dores e os processos internos típicos desse segmento.`
  : `O segmento desse cliente ainda não foi identificado no CRM. Gere exatamente 3 perguntas para cada bloco SPIN focadas em DESCOBRIR o tipo de negócio e sua operação — nada específico de um setor que você não tem certeza que se aplica.`}

Retorne APENAS JSON válido neste formato:
{
  "situationQuestions": ["pergunta 1", "pergunta 2", "pergunta 3"],
  "problemQuestions": ["pergunta 1", "pergunta 2", "pergunta 3"],
  "implicationQuestions": ["pergunta 1", "pergunta 2", "pergunta 3"],
  "needQuestions": ["pergunta 1", "pergunta 2", "pergunta 3"]
}`;

  try {
    const result = await callOpenAI(
      tenantId,
      "briefing_generator",
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "gpt-4o-mini", maxTokens: 1200, temperature: 0.6, responseFormat: { type: "json_object" }, log: req.log },
    );

    let parsed: Record<string, string[]>;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      res.status(502).json({ error: "IA retornou formato inválido" });
      return;
    }

    res.json({
      situationQuestions: parsed.situationQuestions ?? [],
      problemQuestions: parsed.problemQuestions ?? [],
      implicationQuestions: parsed.implicationQuestions ?? [],
      needQuestions: parsed.needQuestions ?? [],
    });
  } catch (err: any) {
    req.log.error({ err }, "briefing/generate-questions error");
    const status = (err as any)?.status ?? 500;
    res.status(status).json({ error: err?.message ?? "Erro ao gerar perguntas com IA" });
  }
});

// ── POST /leads/:leadId/briefing/summarize ────────────────────────────────────
// Reads all briefing data + lead context and asks AI to produce a structured
// "client summary" with pain points and the best closing arguments.
router.post("/leads/:leadId/briefing/summarize", async (req, res) => {
  const leadId = String(req.params.leadId);

  const [lead] = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      mercadoSegmento: leadsTable.mercadoSegmento,
      objetivo: leadsTable.objetivo,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead) {
    res.status(404).json({ error: "Lead não encontrado" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const tenantId = lead.tenantId;

  const [briefing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, leadId));

  const [[profile], catalogPreview] = await Promise.all([
    db
      .select({
        nomeFantasia: businessProfilesTable.nomeFantasia,
        vertical: businessProfilesTable.vertical,
        metodoVendas: businessProfilesTable.metodoVendas,
        diferenciais: businessProfilesTable.diferenciais,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId)),
    getActiveCatalogPreview(tenantId, 5),
  ]);

  // ── Format briefing sections for the prompt ──────────────────────────────
  const fmt = (items: Array<{ question: string; answer: string }> | null | undefined) =>
    (items ?? []).filter((i) => i.answer?.trim()).map((i) => `- P: ${i.question}\n  R: ${i.answer}`).join("\n");

  const produtosDesc = compactCatalogNames(catalogPreview, 5).join(", ") || "produtos/serviços da empresa";

  const objecoesText = (briefing?.objections ?? [])
    .map((o: any) => `  • Objeção: ${o.objection} → Resposta dada: ${o.response ?? "—"}`)
    .join("\n") || "Nenhuma registrada";

  // ── Contexto coletado nas perguntas por etapa do funil (Central de
  // Trabalho) — cobre o que o SPIN não pergunta: pré-contato, o que foi
  // demonstrado/apresentado, feedback da proposta, objeções e condições
  // em negociação. Opcional: só entra se o front mandar o dealId.
  const dealId = typeof req.body?.dealId === "string" ? req.body.dealId : undefined;
  let stageAnswersText = "";
  if (dealId) {
    const [deal] = await db
      .select({ respostasEtapas: dealsTable.respostasEtapas })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)));
    const respostas = (deal?.respostasEtapas ?? {}) as Record<string, Record<string, string>>;
    if (Object.keys(respostas).length) {
      const stages = await db
        .select({ key: pipelineStagesTable.key, label: pipelineStagesTable.label, perguntas: pipelineStagesTable.perguntas })
        .from(pipelineStagesTable)
        .where(eq(pipelineStagesTable.tenantId, tenantId));
      const blocks: string[] = [];
      for (const stage of stages) {
        const stageRespostas = respostas[stage.key];
        if (!stageRespostas) continue;
        const perguntas = (stage.perguntas ?? []) as { id: string; texto: string }[];
        const lines = perguntas
          .filter((p) => stageRespostas[p.id]?.trim())
          .map((p) => `  - P: ${p.texto}\n    R: ${stageRespostas[p.id]}`);
        if (lines.length) blocks.push(`[${stage.label}]\n${lines.join("\n")}`);
      }
      if (blocks.length) stageAnswersText = blocks.join("\n\n");
    }
  }

  const prompt = `Você é um coach de vendas especialista em fechamento. Analise o briefing abaixo e produza um resumo executivo do cliente para o vendedor usar na próxima abordagem de fechamento.

EMPRESA VENDEDORA: ${profile?.nomeFantasia ?? "nossa empresa"} | Segmento: ${profile?.vertical ?? "—"} | Diferencial: ${profile?.diferenciais ?? "—"} | Catálogo oficial ativo: ${produtosDesc}

CLIENTE:
- Nome/Empresa: ${lead.empresa ?? lead.nome}
- Segmento: ${lead.mercadoSegmento ?? "não informado"}
- Objetivo declarado: ${lead.objetivo ?? "não informado"}
- Porte: ${briefing?.prospectSize ?? "não classificado"}
- Canais usados: ${(briefing?.channelsUsed ?? []).join(", ") || "—"}

SITUAÇÃO (SPIN):
${fmt(briefing?.situationAnswers as any) || "Não preenchido"}

PROBLEMAS IDENTIFICADOS:
${fmt(briefing?.problemAnswers as any) || "Não preenchido"}
Problema minimizado pelo cliente: ${briefing?.problemMinimized ? "Sim" : "Não"}

IMPLICAÇÕES / IMPACTO FINANCEIRO:
${fmt(briefing?.implicationAnswers as any) || "Não preenchido"}
Valor estimado de perda: ${briefing?.implicationEstimatedValue ?? "não estimado"}

NECESSIDADE / SOLUÇÃO DESEJADA:
${fmt(briefing?.needAnswers as any) || "Não preenchido"}
Termômetro de necessidade: ${briefing?.needThermometer ?? "—"}

OBJEÇÕES:
${objecoesText}

CONTEXTO REGISTRADO PELO VENDEDOR AO LONGO DO FUNIL (pré-contato, demonstração, negociação):
${stageAnswersText || "Nenhum registrado ainda"}

PRÓXIMO PASSO COMBINADO: ${briefing?.nextStepType ?? "não definido"} | Data: ${briefing?.nextStepDate ?? "—"}

NOTAS LIVRES: ${briefing?.freeNotes ?? "—"}

TAREFA: Com base nesses dados, produza um JSON com o seguinte formato:
{
  "resumoCliente": "Parágrafo de 3-4 frases resumindo o perfil e momento do cliente",
  "doresPrincipais": ["dor 1", "dor 2", "dor 3"],
  "pontosDeForte": ["argumento de fechamento 1", "argumento 2", "argumento 3"],
  "comoContornarObjecoes": [{"objecao": "texto da objeção", "argumento": "como rebater"}],
  "abordagemRecomendada": "Frase curta com a estratégia ideal para fechar este cliente agora",
  "alertas": ["alerta ou risco de perda 1", "alerta 2"]
}

Seja direto, prático e específico para este cliente. Não invente dados que não estão no briefing.`;

  try {
    const result = await callOpenAI(
      tenantId,
      "briefing_generator",
      [{ role: "user", content: prompt }],
      { model: "gpt-4o-mini", maxTokens: 1200, temperature: 0.5, responseFormat: { type: "json_object" }, log: req.log },
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      res.status(502).json({ error: "IA retornou formato inválido" });
      return;
    }

    const summary = {
      resumoCliente:          parsed.resumoCliente          ?? "",
      doresPrincipais:        parsed.doresPrincipais        ?? [],
      pontosDeForte:          parsed.pontosDeForte          ?? [],
      comoContornarObjecoes:  parsed.comoContornarObjecoes  ?? [],
      abordagemRecomendada:   parsed.abordagemRecomendada   ?? "",
      alertas:                parsed.alertas                ?? [],
    };

    // Persist summary to DB so it shows on next load without re-generating
    if (briefing) {
      await db
        .update(leadBriefingsTable)
        .set({ aiSummary: summary, updatedAt: new Date() } as any)
        .where(eq(leadBriefingsTable.id, briefing.id));
    } else {
      await db
        .insert(leadBriefingsTable)
        .values({ tenantId, leadId, aiSummary: summary } as any);
    }

    req.log.info({ tenantId, leadId }, "briefing/summarize: ok");
    res.json(summary);
  } catch (err: any) {
    req.log.error({ err }, "briefing/summarize error");
    const status = (err as any)?.status ?? 500;
    res.status(status).json({ error: err?.message ?? "Erro ao gerar resumo com IA" });
  }
});

// ── POST /api/leads/:id/conversation-starter — Sugere primeira mensagem via IA ──
router.post("/leads/:id/conversation-starter", async (req, res) => {
  const leadId = req.params.id!;
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }

  const [intel] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(and(eq(customerIntelligenceTable.leadId, leadId), eq(customerIntelligenceTable.tenantId, tenantId)))
    .limit(1);

  const recentMsgs = await db
    .select({ conteudo: messagesTable.conteudo, direcao: messagesTable.direcao })
    .from(messagesTable)
    .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
    .where(and(eq(conversationsTable.leadId, leadId), eq(conversationsTable.tenantId, tenantId)))
    .orderBy(desc(messagesTable.createdAt))
    .limit(5);

  const ctx = [
    `Nome: ${lead.nome}`,
    lead.empresa ? `Empresa: ${lead.empresa}` : null,
    (lead as any).segmento ? `Segmento: ${(lead as any).segmento}` : null,
    intel?.nextBestAction ? `Próxima ação sugerida pela IA: ${intel.nextBestAction}` : null,
    intel?.intentAnalysis ? `Intenção de compra: ${intel.intentAnalysis}` : null,
    intel?.churnRisk != null ? `Risco de churn: ${intel.churnRisk}%` : null,
    recentMsgs.length > 0
      ? `Últimas mensagens: ${recentMsgs.map(m => `[${m.direcao}] ${(m.conteudo ?? "").slice(0, 80)}`).join(" | ")}`
      : "Nenhuma conversa anterior registrada.",
  ].filter(Boolean).join("\n");

  try {
    const result = await callOpenAI(
      tenantId,
      "content_generator",
      [
        {
          role: "system",
          content:
            "Você é um assistente de vendas consultivo. Crie uma mensagem inicial de conversa personalizada para o lead, adequada para WhatsApp ou Instagram Direct. A mensagem deve ser: curta (no máximo 3 frases), cordial e natural, referir-se ao contexto do lead sem ser invasiva, e criar abertura para diálogo. Responda apenas com o texto da mensagem, sem aspas, prefixos ou explicações.",
        },
        { role: "user", content: `Contexto do lead:\n${ctx}` },
      ],
      { maxTokens: 250, temperature: 0.82, log: req.log },
    );
    res.json({ message: result.content.trim() });
  } catch {
    res.json({
      message: `Olá, ${lead.nome}! Tudo bem? Estava pensando em você e gostaria de conversar sobre como posso ajudar.`,
    });
  }
});

export default router;
