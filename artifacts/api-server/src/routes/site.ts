import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { siteVerticaisTable, siteContatosTable, leadsTable, dealsTable, webBehaviorEventsTable } from "@workspace/db";
import { eq, and, asc, desc, isNull, isNotNull } from "drizzle-orm";
import { Resend } from "resend";
import { logger } from "../lib/logger.js";
import { storePhone, findLeadByDedup } from "../lib/dedup.js";
import { pickNextVendedor } from "../lib/round-robin.js";
import { recordResponsavelChange } from "../lib/leadResponsavelHistorico.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";
import { resolveAdCampaignFromUtm } from "../lib/adAttribution.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { syncBehaviorIntentForLead } from "../jobs/behaviorIntentSync.js";
import { notifyVisitorOnline } from "../services/visitorPushNotifications.js";
import { resolveRequestGeo } from "../lib/requestGeo.js";
import { leadRegistrationMetadata, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";

const router: IRouter = Router();

const INSTITUTIONAL_TENANT_ID = "1d4ea673-58d0-413a-a554-c9aca72a3121";
const AD_DATA_CONSENT_TEXT_VERSION = "ad-data-measurement-v1-2026-09-01";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

router.get("/site/verticais", async (_req, res) => {
  const rows = await db
    .select()
    .from(siteVerticaisTable)
    .where(eq(siteVerticaisTable.ativo, true))
    .orderBy(asc(siteVerticaisTable.ordem));

  return res.json(rows);
});

router.get("/site/verticais/:slug", async (req, res) => {
  const [row] = await db
    .select()
    .from(siteVerticaisTable)
    .where(
      and(
        eq(siteVerticaisTable.slug, req.params.slug),
        eq(siteVerticaisTable.ativo, true),
      ),
    )
    .limit(1);

  if (!row) {
    return res.status(404).json({ error: "Vertical não encontrada." });
  }

  return res.json(row);
});

const optionalTrackingString = z.string().trim().max(500).optional();
const optionalBehaviorSession = z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/).optional();

type SiteAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  pageUrl?: string;
  referrer?: string;
  landingPageSlug?: string;
  adDataConsent?: boolean;
};

function recoverSiteAttribution(
  body: SiteAttribution,
  rawReferer?: string,
): SiteAttribution {
  let recovered: SiteAttribution = {};
  if (rawReferer) {
    try {
      const url = new URL(rawReferer);
      const lpMatch = url.pathname.match(/^\/lp\/([^/?#]+)/);
      recovered = {
        utmSource: url.searchParams.get("utm_source") ?? undefined,
        utmMedium: url.searchParams.get("utm_medium") ?? undefined,
        utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
        utmContent: url.searchParams.get("utm_content") ?? undefined,
        utmTerm: url.searchParams.get("utm_term") ?? undefined,
        gclid: url.searchParams.get("gclid") ?? undefined,
        fbclid: url.searchParams.get("fbclid") ?? undefined,
        pageUrl: rawReferer,
        landingPageSlug: lpMatch?.[1],
      };
    } catch {
      recovered = { pageUrl: rawReferer.slice(0, 2000) };
    }
  }

  return {
    utmSource: body.utmSource || recovered.utmSource,
    utmMedium: body.utmMedium || recovered.utmMedium,
    utmCampaign: body.utmCampaign || recovered.utmCampaign,
    utmContent: body.utmContent || recovered.utmContent,
    utmTerm: body.utmTerm || recovered.utmTerm,
    gclid: body.gclid || recovered.gclid,
    fbclid: body.fbclid || recovered.fbclid,
    pageUrl: body.pageUrl || recovered.pageUrl,
    referrer: body.referrer || rawReferer,
    landingPageSlug: body.landingPageSlug || recovered.landingPageSlug,
    adDataConsent: typeof body.adDataConsent === "boolean" ? body.adDataConsent : undefined,
  };
}

function consentRecord(granted: boolean) {
  return {
    granted,
    capturedAt: new Date().toISOString(),
    textVersion: AD_DATA_CONSENT_TEXT_VERSION,
  };
}

function attributionRecord(data: SiteAttribution) {
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
    adDataConsent: consentRecord(data.adDataConsent === true),
  };
}

function updateConsentOnly(
  discoveryData: Record<string, unknown> | null | undefined,
  granted: boolean,
): Record<string, unknown> {
  const current = discoveryData ?? {};
  const rawAttribution = current["attribution"];
  const currentAttribution = rawAttribution && typeof rawAttribution === "object"
    ? rawAttribution as Record<string, unknown>
    : {};
  return {
    ...current,
    attribution: {
      ...currentAttribution,
      adDataConsent: consentRecord(granted),
    },
  };
}

const behaviorEventSchema = z.object({
  anonymousSessionId: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  eventType: z.enum(["page_view", "cta_click", "form_start", "form_submit", "engagement"]),
  pageUrl: z.string().trim().max(2000).optional(),
  path: z.string().trim().max(1000).optional(),
  referrer: z.string().trim().max(2000).optional(),
  landingPageSlug: z.string().trim().max(180).optional(),
  utmCampaign: z.string().trim().max(500).optional(),
  engagedMs: z.number().int().min(0).max(86_400_000).optional(),
  scrollDepth: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

router.post("/site/behavior-event", async (req, res) => {
  const parsed = behaviorEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Evento comportamental inválido" });
  }

  const d = parsed.data;
  try {
    const adCampaignId = await resolveAdCampaignFromUtm(
      INSTITUTIONAL_TENANT_ID,
      d.utmCampaign,
      logger,
    );

    const [identifiedSession] = await db
      .select({ leadId: webBehaviorEventsTable.leadId })
      .from(webBehaviorEventsTable)
      .where(and(
        eq(webBehaviorEventsTable.tenantId, INSTITUTIONAL_TENANT_ID),
        eq(webBehaviorEventsTable.anonymousSessionId, d.anonymousSessionId),
        isNotNull(webBehaviorEventsTable.leadId),
      ))
      .orderBy(desc(webBehaviorEventsTable.createdAt))
      .limit(1);

    const geo = await resolveRequestGeo(req);

    await db.insert(webBehaviorEventsTable).values({
      anonymousSessionId: d.anonymousSessionId,
      tenantId: INSTITUTIONAL_TENANT_ID,
      leadId: identifiedSession?.leadId ?? null,
      adCampaignId,
      eventType: d.eventType,
      pageUrl: d.pageUrl ?? null,
      path: d.path ?? null,
      referrer: d.referrer ?? null,
      landingPageSlug: d.landingPageSlug ?? null,
      engagedMs: d.engagedMs ?? null,
      scrollDepth: d.scrollDepth ?? null,
      metadata: {
        ...(d.metadata ?? {}),
        surface: d.metadata?.["surface"] ?? "site",
        country: geo.country,
        region: geo.region,
        city: geo.city,
        latitude: geo.latitude,
        longitude: geo.longitude,
        geoSource: geo.source,
      },
    });

    void notifyVisitorOnline({
      tenantId: INSTITUTIONAL_TENANT_ID,
      sessionId: d.anonymousSessionId,
    }).catch((err) => {
      logger.warn({ err, sessionId: d.anonymousSessionId }, "site/behavior-event: native visitor push failed");
    });

    if (identifiedSession?.leadId) {
      void syncBehaviorIntentForLead(identifiedSession.leadId, INSTITUTIONAL_TENANT_ID).catch((err) => {
        logger.warn({ err, leadId: identifiedSession.leadId }, "site/behavior-event: behavior intent sync failed");
      });
    }

    return res.status(202).json({ accepted: true });
  } catch (err) {
    logger.warn({ err, eventType: d.eventType }, "site/behavior-event: ingest failed");
    return res.status(202).json({ accepted: false });
  }
});

const contatoSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  mensagem: z.string().min(5, "Mensagem obrigatória"),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  origem: z
    .string()
    .regex(/^[a-z0-9_-]+$/, "Origem inválida")
    .max(64)
    .optional(),
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
  adDataConsent: z.boolean().optional(),
  behaviorSessionId: optionalBehaviorSession,
});

router.post("/site/contato", async (req, res) => {
  const parsed = contatoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados inválidos.",
      details: parsed.error.issues.map((i) => i.message),
    });
  }

  const {
    nome,
    email,
    mensagem,
    telefone,
    empresa,
    origem,
    behaviorSessionId,
    ...trackingBody
  } = parsed.data;
  const attribution = recoverSiteAttribution(trackingBody, req.get("referer"));
  const telefoneSanitizado = telefone ? storePhone(telefone) : null;
  const sourceLabel = origem ? `site_${origem}` : "site_institucional";

  await db.insert(siteContatosTable).values({
    nome,
    email,
    mensagem,
    telefone: telefoneSanitizado ?? null,
    empresa: empresa ?? null,
    origem: origem ?? null,
    status: "novo",
  });

  void (async () => {
    try {
      const adCampaignId = await resolveAdCampaignFromUtm(
        INSTITUTIONAL_TENANT_ID,
        attribution.utmCampaign,
        logger,
      );

      const dedup = await findLeadByDedup(
        INSTITUTIONAL_TENANT_ID,
        telefoneSanitizado,
        null,
        nome,
      );

      let leadId: string;
      let attributedNow = false;

      if (dedup.found && dedup.lead) {
        leadId = dedup.lead.id;

        if (typeof attribution.adDataConsent === "boolean") {
          await db
            .update(leadsTable)
            .set({
              discoveryData: updateConsentOnly(
                dedup.lead.discoveryData ?? {},
                attribution.adDataConsent,
              ),
              updatedAt: new Date(),
            })
            .where(and(
              eq(leadsTable.id, leadId),
              eq(leadsTable.tenantId, INSTITUTIONAL_TENANT_ID),
            ));
        }

        if (adCampaignId) {
          const updated = await db
            .update(leadsTable)
            .set({
              adCampaignId,
              updatedAt: new Date(),
            })
            .where(and(
              eq(leadsTable.id, leadId),
              eq(leadsTable.tenantId, INSTITUTIONAL_TENANT_ID),
              isNull(leadsTable.adCampaignId),
            ))
            .returning({ id: leadsTable.id });
          attributedNow = updated.length > 0;
        }
        await db
          .update(leadsTable)
          .set({
            metadata: leadRegistrationMetadata(dedup.lead.metadata, {
              entryChannel: "site",
              entrySource: sourceLabel,
              details: { siteOrigin: origem ?? null },
            }),
            updatedAt: new Date(),
          })
          .where(and(
            eq(leadsTable.id, leadId),
            eq(leadsTable.tenantId, INSTITUTIONAL_TENANT_ID),
          ));
        logger.info({ leadId, nome }, "site/contato: lead já existe — usando existente");
      } else {
        const assignedTo = await pickNextVendedor(INSTITUTIONAL_TENANT_ID).catch(() => null);

        const notasNutricao = [
          origem ? `Origem: ${origem}` : null,
          `Mensagem do site: "${mensagem}"`,
        ]
          .filter(Boolean)
          .join("\n");

        const [createdLead] = await db
          .insert(leadsTable)
          .values({
            tenantId: INSTITUTIONAL_TENANT_ID,
            nome: normalizeLeadName(nome, "Contato do site"),
            email: normalizeLeadEmail(email),
            telefone: telefoneSanitizado ?? null,
            empresa: empresa?.trim() || null,
            notasNutricao,
            source: sourceLabel,
            status: "novo",
            assignedTo: assignedTo ?? null,
            adCampaignId,
            metadata: leadRegistrationMetadata(null, {
              entryChannel: "site",
              entrySource: sourceLabel,
              details: { siteOrigin: origem ?? null },
            }),
            discoveryData: {
              attribution: attributionRecord(attribution),
              siteOrigin: origem ?? null,
              behaviorSessionId: behaviorSessionId ?? null,
            },
          })
          .returning({ id: leadsTable.id });

        leadId = createdLead.id;
        attributedNow = Boolean(adCampaignId);

        if (assignedTo) {
          recordResponsavelChange({
            leadId: createdLead.id,
            responsavelAnteriorId: null,
            responsavelNovoId: assignedTo,
            alteradoPorId: null,
            motivo: "automatico",
          }).catch(() => {});
        }

        const [createdDeal] = await db
          .insert(dealsTable)
          .values({
            tenantId: INSTITUTIONAL_TENANT_ID,
            leadId,
            titulo: nome,
            etapa: "em_aquecimento",
            assignedTo: assignedTo ?? null,
          })
          .returning({ id: dealsTable.id });

        logger.info(
          { leadId, dealId: createdDeal.id, tenantId: INSTITUTIONAL_TENANT_ID },
          "site/contato: lead e deal criados no pipeline institucional",
        );

        if (telefoneSanitizado) {
          dispatchAgentBackground({
            tenantId: INSTITUTIONAL_TENANT_ID,
            leadId,
            mensagem: `[NOVO CONTATO PELO SITE] ${nome} preencheu o formulário "Fale com Especialistas".` +
              (empresa ? ` Empresa: ${empresa}.` : "") +
              ` Mensagem: "${mensagem}"` +
              (origem ? ` (origem: ${origem})` : "") +
              ` Dê boas-vindas e entenda o que precisa — a mensagem foi enviada pelo site, ainda não é uma conversa em andamento.`,
            log: logger,
            forcedAgent: "reception",
            scenario: { origem: "site_contato", origemDetalhe: origem ?? null },
          });
          logger.info({ leadId }, "site/contato: recepção disparada em background");
        } else {
          logger.info({ leadId }, "site/contato: sem telefone — recepção via WhatsApp não disparada");
        }
      }

      if (behaviorSessionId) {
        const linked = await db
          .update(webBehaviorEventsTable)
          .set({ leadId })
          .where(and(
            eq(webBehaviorEventsTable.tenantId, INSTITUTIONAL_TENANT_ID),
            eq(webBehaviorEventsTable.anonymousSessionId, behaviorSessionId),
            isNull(webBehaviorEventsTable.leadId),
          ))
          .returning({ id: webBehaviorEventsTable.id });

        if (linked.length > 0) {
          await syncBehaviorIntentForLead(leadId, INSTITUTIONAL_TENANT_ID);
        }
      }

      if (adCampaignId && attributedNow) {
        await recordAdCampaignEvent({
          tenantId: INSTITUTIONAL_TENANT_ID,
          campaignId: adCampaignId,
          eventType: "lead_attributed",
          severity: "success",
          message: "Pedido de demonstração atribuído à campanha pelo site institucional.",
          dedupeKey: `lead:${leadId}`,
          metadata: {
            leadId,
            channel: "website_demo_request",
            attribution: "utm_campaign",
            siteOrigin: origem ?? null,
            landingPageSlug: attribution.landingPageSlug ?? null,
            utmSource: attribution.utmSource ?? null,
            utmMedium: attribution.utmMedium ?? null,
            adDataConsent: attribution.adDataConsent === true,
            adDataConsentTextVersion: AD_DATA_CONSENT_TEXT_VERSION,
            behaviorSessionId: behaviorSessionId ?? null,
          },
        });
      }
    } catch (err) {
      logger.warn({ err }, "site/contato: falha ao criar lead/deal institucional (não bloqueia resposta)");
    }
  })();

  if (resend) {
    resend.emails
      .send({
        from: "VendorAI Site <noreply@vendorai.app>",
        to: "vendorai@appvendorai.com",
        subject: `[Site] Novo contato: ${nome}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="font-size:18px;color:#111;margin-bottom:16px;">📬 Novo contato recebido pelo site institucional</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
              <tr><td style="padding:8px 0;font-weight:600;width:120px;">Nome</td><td style="padding:8px 0;">${nome}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;">E-mail</td><td style="padding:8px;"><a href="mailto:${email}" style="color:#2563eb;">${email}</a></td></tr>
              ${telefoneSanitizado ? `<tr><td style="padding:8px 0;font-weight:600;">Telefone</td><td style="padding:8px 0;">${telefoneSanitizado}</td></tr>` : ""}
              ${empresa ? `<tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;">Empresa</td><td style="padding:8px;">${empresa}</td></tr>` : ""}
              ${origem ? `<tr><td style="padding:8px 0;font-weight:600;">Origem</td><td style="padding:8px 0;">${origem}</td></tr>` : ""}
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;vertical-align:top;">Mensagem</td><td style="padding:8px;">${mensagem.replace(/\n/g, "<br>")}</td></tr>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#888;">Enviado automaticamente pelo site VendorAI.</p>
          </div>
        `,
      })
      .catch((err) => {
        logger.warn({ err }, "site/contato: falha ao enviar e-mail de notificação");
      });
  } else {
    logger.warn("site/contato: RESEND_API_KEY não configurada — e-mail de notificação ignorado");
  }

  return res.json({
    success: true,
    mensagem: "Recebemos seu contato! Retornamos em breve.",
  });
});

export default router;