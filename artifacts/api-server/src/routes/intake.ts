import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import {
  db,
  tenantsTable,
  usersTable,
  leadsTable,
  dealsTable,
  funisTable,
  webBehaviorEventsTable,
} from "@workspace/db";
import { findLeadByDedup, storePhone, storeDocument } from "../lib/dedup.js";
import { resolveAdCampaignFromUtm } from "../lib/adAttribution.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { syncBehaviorIntentForLead } from "../jobs/behaviorIntentSync.js";
import { signToken } from "../lib/jwt.js";
import { leadRegistrationMetadata, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";

export const intakeRouter: IRouter = Router();

const AD_DATA_CONSENT_TEXT_VERSION = "ad-data-measurement-v1-2026-09-01";
const optionalTrackingString = z.string().trim().max(500).optional();
const optionalBehaviorSessionId = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .optional();

const trackingFields = {
  utmSource: optionalTrackingString,
  utmMedium: optionalTrackingString,
  utmCampaign: optionalTrackingString,
  utmContent: optionalTrackingString,
  utmTerm: optionalTrackingString,
  gclid: optionalTrackingString,
  fbclid: optionalTrackingString,
  pageUrl: z.string().trim().max(2000).optional(),
  referrer: z.string().trim().max(2000).optional(),
  landingPageSlug: optionalTrackingString,
  behaviorSessionId: optionalBehaviorSessionId,
  adDataConsent: z.boolean().optional(),
};

const intakeSchema = z.object({
  nome: z.string().min(1),
  email: z.string().optional(),
  telefone: z.string().optional(),
  documento: z.string().optional(),
  cargo: z.string().optional(),
  empresa: z.string().optional(),
  segmento: z.string().optional(),
  descricaoNegocio: z.string().optional(),
  produtos: z.string().optional(),
  diferenciais: z.string().optional(),
  publicoAlvo: z.string().optional(),
  concorrentes: z.string().optional(),
  temSite: z.string().optional(),
  urlSite: z.string().optional(),
  precisaCriar: z.array(z.string()).optional(),
  redesSociais: z.array(z.string()).optional(),
  canaisVenda: z.array(z.string()).optional(),
  temCrm: z.string().optional(),
  qualCrm: z.string().optional(),
  tamanhoEquipe: z.string().optional(),
  ticketMedio: z.string().optional(),
  leadsPerMes: z.string().optional(),
  desafioPrincipal: z.string().optional(),
  objetivo6meses: z.string().optional(),
  urgencia: z.string().optional(),
  orcamento: z.string().optional(),
  ...trackingFields,
});

type IntakeData = z.infer<typeof intakeSchema>;

type TrackingData = Pick<
  IntakeData,
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "utmContent"
  | "utmTerm"
  | "gclid"
  | "fbclid"
  | "pageUrl"
  | "referrer"
  | "landingPageSlug"
  | "behaviorSessionId"
  | "adDataConsent"
>;

const trialSignupSchema = z.object({
  nomeEmpresa: z.string().trim().min(1, "Nome da empresa é obrigatório").max(180),
  nomePessoa: z.string().trim().min(1, "Seu nome é obrigatório").max(180),
  email: z.email(),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  telefone: z.string().trim().max(40).optional(),
  warmLeadId: z.string().uuid().optional().nullable(),
  instagram: z.string().trim().max(180).optional(),
  segmento: z.string().trim().max(180).optional(),
  cidadeRegiao: z.string().trim().max(240).optional(),
  produtos: z.string().trim().max(2000).optional(),
  leadsPerMes: z.string().trim().max(120).optional(),
  canaisVenda: z.string().trim().max(1000).optional(),
  desafioPrincipal: z.string().trim().max(2000).optional(),
  objetivo6meses: z.string().trim().max(2000).optional(),
  ...trackingFields,
});

type TrialSignupData = z.infer<typeof trialSignupSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function attributionFromReferer(rawReferer?: string): Partial<TrackingData> {
  if (!rawReferer) return {};
  try {
    const url = new URL(rawReferer);
    return {
      utmSource: url.searchParams.get("utm_source") ?? undefined,
      utmMedium: url.searchParams.get("utm_medium") ?? undefined,
      utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
      utmContent: url.searchParams.get("utm_content") ?? undefined,
      utmTerm: url.searchParams.get("utm_term") ?? undefined,
      gclid: url.searchParams.get("gclid") ?? undefined,
      fbclid: url.searchParams.get("fbclid") ?? undefined,
      pageUrl: rawReferer,
      landingPageSlug: url.hostname.endsWith(".appvendorai.com")
        ? url.hostname.slice(0, -".appvendorai.com".length)
        : undefined,
    };
  } catch {
    return { pageUrl: rawReferer.slice(0, 2000) };
  }
}

function mergeTracking<T extends TrackingData>(body: T, referer?: string): T {
  const recovered = attributionFromReferer(referer);
  return {
    ...body,
    utmSource: body.utmSource || recovered.utmSource,
    utmMedium: body.utmMedium || recovered.utmMedium,
    utmCampaign: body.utmCampaign || recovered.utmCampaign,
    utmContent: body.utmContent || recovered.utmContent,
    utmTerm: body.utmTerm || recovered.utmTerm,
    gclid: body.gclid || recovered.gclid,
    fbclid: body.fbclid || recovered.fbclid,
    pageUrl: body.pageUrl || recovered.pageUrl,
    referrer: body.referrer || referer,
    landingPageSlug: body.landingPageSlug || recovered.landingPageSlug,
    adDataConsent: body.adDataConsent === true,
  };
}

function attributionRecord(data: TrackingData) {
  const capturedAt = new Date().toISOString();
  return {
    utmSource: data.utmSource || null,
    utmMedium: data.utmMedium || null,
    utmCampaign: data.utmCampaign || null,
    utmContent: data.utmContent || null,
    utmTerm: data.utmTerm || null,
    gclid: data.gclid || null,
    fbclid: data.fbclid || null,
    pageUrl: data.pageUrl || null,
    referrer: data.referrer || null,
    landingPageSlug: data.landingPageSlug || null,
    capturedAt,
    adDataConsent: {
      granted: data.adDataConsent === true,
      capturedAt,
      textVersion: AD_DATA_CONSENT_TEXT_VERSION,
    },
  };
}

async function linkBehaviorSessionToLead(params: {
  behaviorSessionId?: string;
  tenantId: string;
  leadId?: string | null;
  log: { warn: (obj: unknown, msg?: string) => void };
  context: string;
}): Promise<void> {
  const { behaviorSessionId, tenantId, leadId, log, context } = params;
  if (!behaviorSessionId || !leadId) return;

  try {
    const linked = await db
      .update(webBehaviorEventsTable)
      .set({ leadId })
      .where(and(
        eq(webBehaviorEventsTable.tenantId, tenantId),
        eq(webBehaviorEventsTable.anonymousSessionId, behaviorSessionId),
      ))
      .returning({ id: webBehaviorEventsTable.id });

    if (linked.length > 0) await syncBehaviorIntentForLead(leadId, tenantId);
  } catch (err) {
    log.warn({ err, tenantId, leadId, context }, `${context}: behavior session link failed`);
  }
}

async function ensureWarmupDeal(tenantId: string, leadId: string, title: string): Promise<void> {
  const [lead] = await db
    .select({ pipelineExempt: leadsTable.pipelineExempt })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead || lead.pipelineExempt) return;

  const [existingDeal] = await db
    .select({ id: dealsTable.id })
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, leadId)))
    .limit(1);
  if (existingDeal) return;

  await db.insert(dealsTable).values({
    tenantId,
    leadId,
    titulo: title,
    etapa: "em_aquecimento",
    probabilidade: 10,
  });
}

function slugBase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "trial";
}

intakeRouter.get("/public/:tenantSlug/intake", async (req, res) => {
  const slug = String(req.params["tenantSlug"]);
  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));

  if (!tenant) return res.status(404).json({ error: "Empresa não encontrada" });
  return res.json({ name: tenant.name, slug: tenant.slug });
});

intakeRouter.post("/public/:tenantSlug/intake", async (req, res) => {
  const slug = String(req.params["tenantSlug"]);
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));

  if (!tenant) return res.status(404).json({ error: "Empresa não encontrada" });

  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
  }

  const d = mergeTracking(parsed.data, req.get("referer"));
  const adCampaignId = await resolveAdCampaignFromUtm(tenant.id, d.utmCampaign, req.log);
  const attribution = attributionRecord(d);
  const discoveryData: Record<string, unknown> = {
    segmento: d.segmento,
    descricaoNegocio: d.descricaoNegocio,
    produtos: d.produtos,
    diferenciais: d.diferenciais,
    publicoAlvo: d.publicoAlvo,
    concorrentes: d.concorrentes,
    temSite: d.temSite,
    urlSite: d.urlSite,
    precisaCriar: d.precisaCriar,
    redesSociais: d.redesSociais,
    canaisVenda: d.canaisVenda,
    temCrm: d.temCrm,
    qualCrm: d.qualCrm,
    leadsPerMes: d.leadsPerMes,
    ticketMedio: d.ticketMedio,
    objetivo6meses: d.objetivo6meses,
    desafioPrincipal: d.desafioPrincipal,
    cargo: d.cargo,
    attribution,
    acquisitionStage: "aquecimento",
    capturedAt: new Date().toISOString(),
  };

  const match = await findLeadByDedup(tenant.id, d.telefone, d.documento, d.nome);
  let leadId: string | undefined;
  let attributedNow = false;

  if (match.found) {
    leadId = match.lead.id;
    const [current] = await db
      .select({ discoveryData: leadsTable.discoveryData, adCampaignId: leadsTable.adCampaignId })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenant.id)))
      .limit(1);
    const updateData: Record<string, unknown> = {
      nome: normalizeLeadName(d.nome, "Lead do formulário"),
      email: normalizeLeadEmail(d.email),
      telefone: storePhone(d.telefone),
      empresa: d.empresa?.trim() || null,
      objetivo: d.objetivo6meses || null,
      mercadoSegmento: d.segmento || null,
      profissao: d.cargo || null,
      metadata: leadRegistrationMetadata(match.lead.metadata, {
        entryChannel: "site",
        entrySource: slug === "vendorai" ? "website_warmup" : "website",
      }),
      dorPrincipal: d.desafioPrincipal || null,
      discoveryData: { ...asRecord(current?.discoveryData), ...discoveryData },
      updatedAt: new Date(),
    };
    if (adCampaignId && !current?.adCampaignId) {
      updateData.adCampaignId = adCampaignId;
      attributedNow = true;
    }
    await db.update(leadsTable).set(updateData).where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenant.id)));
  } else {
    const [lead] = await db.insert(leadsTable).values({
      tenantId: tenant.id,
      nome: normalizeLeadName(d.nome, "Lead do formulário"),
      email: normalizeLeadEmail(d.email),
      telefone: storePhone(d.telefone),
      documento: storeDocument(d.documento),
      empresa: d.empresa?.trim() || null,
      objetivo: d.objetivo6meses || null,
      mercadoSegmento: d.segmento || null,
      profissao: d.cargo || null,
      dorPrincipal: d.desafioPrincipal || null,
      urgencia: d.urgencia || null,
      orcamento: d.orcamento || null,
      tamanhoEquipe: d.tamanhoEquipe || null,
      status: "novo",
      source: slug === "vendorai" ? "website_warmup" : "website",
      adCampaignId,
      metadata: leadRegistrationMetadata(null, {
        entryChannel: "site",
        entrySource: slug === "vendorai" ? "website_warmup" : "website",
      }),
      discoveryData,
      possivelDuplicata: match.similar ? true : false,
      leadSimilarId: match.similar?.id ?? null,
    }).returning({ id: leadsTable.id });
    leadId = lead?.id;
    attributedNow = Boolean(adCampaignId && leadId);
  }

  if (leadId) {
    await ensureWarmupDeal(tenant.id, leadId, d.empresa || d.nome);
  }

  await linkBehaviorSessionToLead({
    behaviorSessionId: d.behaviorSessionId,
    tenantId: tenant.id,
    leadId,
    log: req.log,
    context: "intake",
  });

  if (adCampaignId && leadId && attributedNow) {
    try {
      await recordAdCampaignEvent({
        tenantId: tenant.id,
        campaignId: adCampaignId,
        eventType: "lead_attributed",
        severity: "success",
        message: "Lead atribuído à campanha por UTM no formulário público.",
        dedupeKey: `lead:${leadId}`,
        metadata: {
          leadId,
          channel: "website",
          attribution: "utm_campaign",
          utmSource: d.utmSource ?? null,
          utmMedium: d.utmMedium ?? null,
          landingPageSlug: d.landingPageSlug ?? null,
          adDataConsent: d.adDataConsent === true,
        },
      });
    } catch (err) {
      req.log.warn({ err, tenantId: tenant.id, leadId, adCampaignId }, "intake: attribution event failed");
    }
  }

  return res.status(201).json({
    ok: true,
    leadId,
    stage: "aquecimento",
    isDuplicate: match.found ? true : match.similar ? "possible" : false,
    attributedCampaign: adCampaignId,
  });
});

intakeRouter.post("/auth/trial-signup", async (req, res) => {
  const parsed = trialSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const d = mergeTracking(parsed.data as TrialSignupData & TrackingData, req.get("referer"));
  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, d.email))
    .limit(1);
  if (existingUser) {
    res.status(409).json({ error: "Este e-mail já possui uma conta. Entre no VendorAI ou use outro e-mail." });
    return;
  }

  const trialExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const hashed = await bcrypt.hash(d.senha, 12);
  const slug = `${slugBase(d.nomeEmpresa)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const profileDescription = [
      d.cidadeRegiao ? `Região: ${d.cidadeRegiao}` : null,
      d.produtos ? `Produtos/serviços: ${d.produtos}` : null,
      d.desafioPrincipal ? `Desafio: ${d.desafioPrincipal}` : null,
      d.objetivo6meses ? `Objetivo: ${d.objetivo6meses}` : null,
    ].filter(Boolean).join(" | ");

    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: d.nomeEmpresa,
        nomeEmpresa: d.nomeEmpresa,
        slug,
        status: "active",
        isDemo: true,
        demoExpiresAt: trialExpiresAt,
        provisioningMethod: "trial",
        planId: null,
        vertical: d.segmento || null,
        segmento: d.segmento || null,
        descricao: profileDescription || null,
      })
      .returning({ id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug });

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name: d.nomePessoa,
        email: d.email,
        password: hashed,
        role: "admin",
        platformRole: "tenant_admin",
        telefone: d.telefone || null,
      })
      .returning({
        id: usersTable.id,
        tenantId: usersTable.tenantId,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        platformRole: usersTable.platformRole,
        telefone: usersTable.telefone,
      });

    let salesLeadId: string | null = null;
    let adCampaignId: string | null = null;

    try {
      const [vendorai] = await db
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.slug, "vendorai"))
        .limit(1);

      if (vendorai) {
        adCampaignId = await resolveAdCampaignFromUtm(vendorai.id, d.utmCampaign, req.log);
        const [funil] = await db
          .select({ id: funisTable.id })
          .from(funisTable)
          .where(and(eq(funisTable.tenantId, vendorai.id), eq(funisTable.nome, "Funil de Vendas — VendorAI")))
          .limit(1);

        const qualification = {
          segmento: d.segmento || null,
          cidadeRegiao: d.cidadeRegiao || null,
          produtos: d.produtos || null,
          leadsPerMes: d.leadsPerMes || null,
          canaisVenda: d.canaisVenda ? d.canaisVenda.split(",").map((item) => item.trim()).filter(Boolean) : [],
          desafioPrincipal: d.desafioPrincipal || null,
          objetivo6meses: d.objetivo6meses || null,
          instagram: d.instagram || null,
        };

        let warmLead: {
          id: string;
          email: string | null;
          discoveryData: unknown;
          adCampaignId: string | null;
        } | undefined;

        if (d.warmLeadId) {
          [warmLead] = await db
            .select({
              id: leadsTable.id,
              email: leadsTable.email,
              discoveryData: leadsTable.discoveryData,
              adCampaignId: leadsTable.adCampaignId,
            })
            .from(leadsTable)
            .where(and(eq(leadsTable.id, d.warmLeadId), eq(leadsTable.tenantId, vendorai.id)))
            .limit(1);
          if (warmLead && warmLead.email?.toLowerCase() !== d.email.toLowerCase()) warmLead = undefined;
        }

        const trialDiscovery = {
          ...(warmLead ? asRecord(warmLead.discoveryData) : {}),
          ...qualification,
          acquisitionStage: "trial",
          trialTenantId: tenant.id,
          trialStartedAt: new Date().toISOString(),
          trialExpiresAt: trialExpiresAt.toISOString(),
          attribution: warmLead && asRecord(warmLead.discoveryData).attribution
            ? asRecord(warmLead.discoveryData).attribution
            : attributionRecord(d),
          prePersonalization: {
            segment: d.segmento || null,
            products: d.produtos || null,
            objective: d.objetivo6meses || null,
            pain: d.desafioPrincipal || null,
            channels: qualification.canaisVenda,
            region: d.cidadeRegiao || null,
          },
        };

        if (warmLead) {
          salesLeadId = warmLead.id;
          await db.update(leadsTable).set({
            nome: d.nomePessoa,
            empresa: d.nomeEmpresa,
            email: d.email,
            telefone: storePhone(d.telefone),
            source: "trial_signup",
            status: "novo",
            objetivo: d.objetivo6meses || null,
            dorPrincipal: d.desafioPrincipal || null,
            adCampaignId: warmLead.adCampaignId || adCampaignId,
            discoveryData: trialDiscovery,
            updatedAt: new Date(),
          }).where(and(eq(leadsTable.id, warmLead.id), eq(leadsTable.tenantId, vendorai.id)));
        } else {
          const [salesLead] = await db.insert(leadsTable).values({
            tenantId: vendorai.id,
            nome: d.nomePessoa,
            empresa: d.nomeEmpresa,
            email: d.email,
            telefone: storePhone(d.telefone),
            source: "trial_signup",
            status: "novo",
            objetivo: d.objetivo6meses || null,
            dorPrincipal: d.desafioPrincipal || null,
            adCampaignId,
            discoveryData: trialDiscovery,
          }).returning({ id: leadsTable.id });
          salesLeadId = salesLead?.id ?? null;
        }

        if (salesLeadId) {
          const [existingDeal] = await db
            .select({ id: dealsTable.id })
            .from(dealsTable)
            .where(and(eq(dealsTable.tenantId, vendorai.id), eq(dealsTable.leadId, salesLeadId)))
            .limit(1);

          if (existingDeal) {
            await db.update(dealsTable).set({
              titulo: `Trial — ${d.nomeEmpresa}`,
              etapa: "novo",
              funilId: funil?.id ?? null,
              probabilidade: 30,
              updatedAt: new Date(),
            }).where(eq(dealsTable.id, existingDeal.id));
          } else {
            await db.insert(dealsTable).values({
              tenantId: vendorai.id,
              leadId: salesLeadId,
              titulo: `Trial — ${d.nomeEmpresa}`,
              etapa: "novo",
              funilId: funil?.id ?? null,
              probabilidade: 30,
            });
          }

          await linkBehaviorSessionToLead({
            behaviorSessionId: d.behaviorSessionId,
            tenantId: vendorai.id,
            leadId: salesLeadId,
            log: req.log,
            context: "trial-signup",
          });
        }

        if (adCampaignId && salesLeadId) {
          await recordAdCampaignEvent({
            tenantId: vendorai.id,
            campaignId: adCampaignId,
            eventType: "trial_started",
            severity: "success",
            message: "Trial de 5 dias iniciado a partir desta campanha.",
            dedupeKey: `trial:${tenant.id}:started`,
            metadata: {
              trialTenantId: tenant.id,
              leadId: salesLeadId,
              utmSource: d.utmSource ?? null,
              utmMedium: d.utmMedium ?? null,
              utmContent: d.utmContent ?? null,
              gclid: d.gclid ?? null,
              fbclid: d.fbclid ?? null,
              landingPageSlug: d.landingPageSlug ?? null,
              adDataConsent: d.adDataConsent === true,
              adDataConsentTextVersion: AD_DATA_CONSENT_TEXT_VERSION,
            },
          });
        }
      }
    } catch (err) {
      req.log.warn({ err, trialTenantId: tenant.id }, "trial-signup: commercial attribution failed");
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
    });

    res.status(201).json({
      token,
      user,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isDemo: true,
        provisioningMethod: "trial",
        demoExpiresAt: trialExpiresAt,
        segmento: d.segmento || null,
      },
      salesLeadId,
      attributedCampaign: adCampaignId,
      demoUrl: `/app?tenant=${tenant.slug}`,
    });
  } catch (err) {
    req.log.error({ err, email: d.email }, "trial-signup: failed");
    res.status(500).json({ error: "Não foi possível criar o teste agora. Tente novamente." });
  }
});
