import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { db, tenantsTable, leadsTable } from "@workspace/db";
import { findLeadByDedup, storePhone, storeDocument } from "../lib/dedup.js";
import { resolveAdCampaignFromUtm } from "../lib/adAttribution.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

export const intakeRouter: IRouter = Router();

const optionalTrackingString = z.string().trim().max(500).optional();

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

  // First-party attribution. These values come from the public page URL and
  // are persisted with the lead so Ads can be optimized against CRM revenue,
  // not only platform clicks/conversions.
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
});

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

  const d = parsed.data;
  const adCampaignId = await resolveAdCampaignFromUtm(tenant.id, d.utmCampaign, req.log);
  const attribution = {
    utmSource: d.utmSource || null,
    utmMedium: d.utmMedium || null,
    utmCampaign: d.utmCampaign || null,
    utmContent: d.utmContent || null,
    utmTerm: d.utmTerm || null,
    gclid: d.gclid || null,
    fbclid: d.fbclid || null,
    pageUrl: d.pageUrl || null,
    referrer: d.referrer || null,
    landingPageSlug: d.landingPageSlug || null,
    capturedAt: new Date().toISOString(),
  };

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