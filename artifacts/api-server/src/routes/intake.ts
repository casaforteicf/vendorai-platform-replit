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
} from "@workspace/db";
import { findLeadByDedup, storePhone, storeDocument } from "../lib/dedup.js";
import { resolveAdCampaignFromUtm } from "../lib/adAttribution.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { signToken } from "../lib/jwt.js";

export const intakeRouter: IRouter = Router();

const optionalTrackingString = z.string().trim().max(500).optional();

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
>;

const trialSignupSchema = z.object({
  nomeEmpresa: z.string().trim().min(1, "Nome da empresa é obrigatório").max(180),
  nomePessoa: z.string().trim().min(1, "Seu nome é obrigatório").max(180),
  email: z.email(),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  telefone: z.string().trim().max(40).optional(),
  ...trackingFields,
});

type TrialSignupData = z.infer<typeof trialSignupSchema>;

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
  };
}

function attributionRecord(data: TrackingData) {
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
    capturedAt: new Date().toISOString(),
  };
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

  if (!tenant) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }

  res.json({ name: tenant.name, slug: tenant.slug });
});

intakeRouter.post("/public/:tenantSlug/intake", async (req, res) => {
  const slug = String(req.params["tenantSlug"]);

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));

  if (!tenant) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }

  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
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
    cargo: d.cargo,
    attribution,
  };

  // Dedup: check for existing lead by phone or document. Attribution follows a
  // first-touch rule: a known lead keeps its original ad campaign; a campaign
  // is attached only when the lead does not have one yet.
  const match = await findLeadByDedup(tenant.id, d.telefone, d.documento, d.nome);
  let leadId: string | undefined;
  let attributedNow = false;

  if (match.found) {
    leadId = match.lead.id;
    if (adCampaignId) {
      const updated = await db
        .update(leadsTable)
        .set({ updatedAt: new Date(), adCampaignId })
        .where(and(
          eq(leadsTable.id, leadId),
          eq(leadsTable.tenantId, tenant.id),
          isNull(leadsTable.adCampaignId),
        ))
        .returning({ id: leadsTable.id });
      attributedNow = updated.length > 0;
      if (!attributedNow) {
        await db.update(leadsTable).set({ updatedAt: new Date() }).where(eq(leadsTable.id, leadId));
      }
    } else {
      await db
        .update(leadsTable)
        .set({ updatedAt: new Date() })
        .where(eq(leadsTable.id, leadId));
    }
  } else {
    const insertData = {
      tenantId: tenant.id,
      nome: d.nome,
      email: d.email || null,
      telefone: storePhone(d.telefone),
      documento: storeDocument(d.documento),
      empresa: d.empresa || null,
      objetivo: d.objetivo6meses || null,
      dorPrincipal: d.desafioPrincipal || null,
      urgencia: d.urgencia || null,
      orcamento: d.orcamento || null,
      tamanhoEquipe: d.tamanhoEquipe || null,
      status: "novo" as const,
      source: "website",
      adCampaignId,
      discoveryData,
      possivelDuplicata: match.similar ? true : false,
      leadSimilarId: match.similar?.id ?? null,
    };
    const [lead] = await db.insert(leadsTable).values(insertData).returning({ id: leadsTable.id });
    leadId = lead?.id;
    attributedNow = Boolean(adCampaignId && leadId);
  }

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
        },
      });
    } catch (err) {
      // Attribution telemetry must never block lead capture.
      req.log.warn({ err, tenantId: tenant.id, leadId, adCampaignId }, "intake: attribution event failed");
    }
  }

  res.status(201).json({
    ok: true,
    leadId,
    isDuplicate: match.found ? true : match.similar ? "possible" : false,
    attributedCampaign: adCampaignId,
  });
});

// Trial individual de 5 dias usado pelo site institucional. Esta rota vive no
// router público já montado antes do middleware global de autenticação. Mantém o
// /auth/demo-signup legado intacto enquanto o lançamento migra para um fluxo com
// atribuição first-party e provisioningMethod explícito.
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
    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: d.nomeEmpresa,
        slug,
        status: "active",
        isDemo: true,
        demoExpiresAt: trialExpiresAt,
        provisioningMethod: "trial",
        planId: null,
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

    // O trial também entra no CRM comercial da própria VendorAI. A origem de
    // mídia é resolvida no tenant VendorAI (onde estão as campanhas do lançamento),
    // não no novo tenant vazio criado para o usuário experimentar o produto.
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
          .where(and(
            eq(funisTable.tenantId, vendorai.id),
            eq(funisTable.nome, "Funil de Vendas — VendorAI"),
          ))
          .limit(1);

        const [salesLead] = await db
          .insert(leadsTable)
          .values({
            tenantId: vendorai.id,
            nome: d.nomePessoa,
            empresa: d.nomeEmpresa,
            email: d.email,
            telefone: d.telefone || null,
            source: "trial_signup",
            status: "novo",
            adCampaignId,
            discoveryData: {
              trialTenantId: tenant.id,
              trialStartedAt: new Date().toISOString(),
              trialExpiresAt: trialExpiresAt.toISOString(),
              attribution: attributionRecord(d),
            },
          })
          .returning({ id: leadsTable.id });

        salesLeadId = salesLead?.id ?? null;
        if (salesLeadId) {
          await db.insert(dealsTable).values({
            tenantId: vendorai.id,
            leadId: salesLeadId,
            titulo: `Trial — ${d.nomeEmpresa}`,
            etapa: "novo",
            funilId: funil?.id ?? null,
            probabilidade: 30,
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
            },
          });
        }
      }
    } catch (err) {
      // O CRM/telemetria nunca deve impedir o usuário de começar o trial.
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
