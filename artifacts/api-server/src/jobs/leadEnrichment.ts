/**
 * Cmd 22 — Motor Preditivo: Lead Enrichment Job
 *
 * Phases:
 *  2A · Digital Scanner — maturidade digital
 *  2B · Growth Radar    — sinais de expansão
 *  3  · Propensity Score + ROI via GPT-4o-mini
 *
 * Called after lead creation (fire-and-forget). Auto-dispatches SDR when
 * score >= tenant's auto_dispatch_threshold AND the cold prospect quality
 * gate has enough verified evidence to support a responsible approach.
 */
import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  segmentBenchmarksTable,
  sdrVerticalProfilesTable,
  prospectorConfigTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";
import { sendSdrFirstApproach } from "../services/sdrService.js";
import { getSimilarityBonus, storeConvertedEmbedding } from "../lib/prospectorMemory.js";
import { logger as rootLogger } from "../lib/logger.js";
import { checkHasMetaAds, checkGooglePresence } from "../services/cnpjService.js";
import { evaluateColdProspectQuality } from "../lib/coldProspectQuality.js";

const COLD_OUTREACH_TRIGGER =
  "[PROSPECÇÃO AUTOMÁTICA] Novo lead enriquecido e priorizado. Use SOMENTE as evidências verificáveis do coldProspectDossier/enrichment_data para personalizar a primeira mensagem. Não afirme perdas, problemas internos ou fatos que não possam ser comprovados externamente.";

// ── Digital Scanner ────────────────────────────────────────────────────────

interface DigitalScan {
  tem_site: boolean;
  site_qualidade: "nenhum" | "simples" | "profissional";
  tem_agendamento_online: boolean;
  tem_ecommerce: boolean;
  presenca_instagram: boolean;
  indicio_crm: boolean;
  presenca_google?: boolean;
}

async function runDigitalScanner(lead: {
  websiteUrl?: string | null;
  instagramHandle?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<DigitalScan> {
  const site = lead.websiteUrl ?? null;
  const result: DigitalScan = {
    tem_site: !!site,
    site_qualidade: "nenhum",
    tem_agendamento_online: false,
    tem_ecommerce: false,
    presenca_instagram: !!lead.instagramHandle,
    indicio_crm: false,
  };

  if (!site) return result;

  try {
    const url = site.startsWith("http") ? site : `https://${site}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (VendorAI enrichment bot)" },
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      result.site_qualidade = "simples";
      return result;
    }

    const html = (await resp.text()).toLowerCase();

    // Quality heuristic
    const hasSsl = url.startsWith("https");
    const hasWordpress = html.includes("wp-content") || html.includes("wordpress");
    const isLanding = html.length < 8000;
    if (!hasSsl || isLanding) {
      result.site_qualidade = "simples";
    } else {
      result.site_qualidade = "profissional";
    }

    // Feature detection
    result.tem_agendamento_online =
      html.includes("agendar") || html.includes("scheduling") || html.includes("calendly") || html.includes("doctoralia");
    result.tem_ecommerce =
      html.includes("adicionar ao carrinho") || html.includes("comprar agora") || html.includes("shopify") || html.includes("woocommerce");
    result.presenca_instagram =
      result.presenca_instagram || html.includes("instagram.com") || html.includes("@");

    // CRM indicators
    result.indicio_crm =
      html.includes("rdstation") || html.includes("hubspot") || html.includes("pipedrive") ||
      html.includes("salesforce") || html.includes("hs-script") || html.includes("rd-station");

    // WordPress can be professional
    if (hasWordpress && hasSsl && !isLanding) result.site_qualidade = "profissional";
  } catch {
    result.site_qualidade = site ? "simples" : "nenhum";
  }

  return result;
}

// ── Growth Radar ───────────────────────────────────────────────────────────

interface GrowthScan {
  reviews_velocity: number;
  rating_trend: "subindo" | "estavel" | "caindo";
  horario_estendido: boolean;
  multiplas_unidades: boolean;
  contratando: boolean;
  anuncios_ativos: boolean;
}

function runGrowthRadar(lead: {
  metadata?: Record<string, unknown> | null;
  discoveryData?: Record<string, unknown> | null;
}): GrowthScan {
  const meta = (lead.metadata ?? {}) as Record<string, unknown>;
  const discovery = (lead.discoveryData ?? {}) as Record<string, unknown>;

  // Reviews velocity: se tiver total_ratings no metadata, estimar velocity
  const totalRatings = Number(meta["total_ratings"] ?? 0);
  const rating = Number(meta["rating"] ?? 0);

  // Heurísticas básicas — sem acesso temporal real, usamos proxy
  const reviewsVelocity = totalRatings > 200 ? 8 : totalRatings > 100 ? 5 : totalRatings > 50 ? 3 : 1;
  const ratingTrend: "subindo" | "estavel" | "caindo" =
    rating >= 4.5 ? "subindo" : rating >= 4.0 ? "estavel" : "caindo";
  const horarioEstendido = !!(discovery["hours_type"] === "OPERATIONAL_HOURS" || meta["extended_hours"]);
  const multiplasUnidades = !!(meta["chain"] || Number(meta["place_count"] ?? 0) > 1);

  return {
    reviews_velocity: reviewsVelocity,
    rating_trend: ratingTrend,
    horario_estendido: horarioEstendido,
    multiplas_unidades: multiplasUnidades,
    contratando: false,
    anuncios_ativos: false, // enriched in Phase 2C (Meta Ads)
  };
}

// ── Propensity Score + ROI ─────────────────────────────────────────────────

interface ScoreResult {
  propensity_score: number;
  score_breakdown: {
    dor_operacional: number;
    momento_expansao: number;
    capacidade_pagamento: number;
  };
  priority_reason: string;
  roi_estimate: {
    volume_atendimentos_mes: number;
    perda_estimada_mes: number;
    ganho_potencial_mes: number;
    ticket_estimado: string;
  };
}

async function scoreLead(params: {
  lead: typeof leadsTable.$inferSelect;
  digital: DigitalScan;
  growth: GrowthScan;
  benchmark: typeof segmentBenchmarksTable.$inferSelect | null;
  tenantId: string;
}): Promise<ScoreResult> {
  const { lead, digital, growth, benchmark } = params;

  const ctx = {
    nome: lead.nome,
    segmento: lead.mercadoSegmento ?? lead.metadata?.["setor"] ?? "geral",
    cidade: lead.endereco ?? lead.metadata?.["cidade"] ?? "",
    rating: lead.metadata?.["rating"] ?? null,
    total_ratings: lead.metadata?.["total_ratings"] ?? null,
    digital,
    growth,
    benchmark: benchmark
      ? {
          ticket_medio: benchmark.ticketMedio,
          volume_medio: benchmark.volumeMedioAtendimentos,
          perda_por_lead: benchmark.perdaEstimadaPorLeadPerdido,
        }
      : null,
  };

  const prompt = `Você é um motor de análise de propensão de compra para um CRM B2B.
Analise os dados do prospect abaixo e retorne um JSON com a seguinte estrutura exata:

{
  "propensity_score": <0-100>,
  "score_breakdown": {
    "dor_operacional": <0-40, baseado em sinais externos verificáveis de oportunidade>,
    "momento_expansao": <0-35, baseado em sinais Growth Radar>,
    "capacidade_pagamento": <0-25, baseado em porte, ticket do segmento e múltiplas unidades>
  },
  "priority_reason": "<frase curta em português explicando por que vale priorizar este prospect, sem afirmar fatos internos não verificados>",
  "roi_estimate": {
    "volume_atendimentos_mes": <estimativa interna para priorização>,
    "perda_estimada_mes": <estimativa interna, nunca apresentar ao prospect como fato>,
    "ganho_potencial_mes": <estimativa interna, nunca apresentar ao prospect como fato>,
    "ticket_estimado": "<PME | PME+ | Enterprise>"
  }
}

Dados do prospect:
${JSON.stringify(ctx, null, 2)}

Regras:
- diferencie fatos observados de inferências
- não invente fatos, contatos, sistemas usados ou problemas internos
- reviews_velocity alto + rating subindo pode indicar momento de expansão
- múltiplas unidades pode indicar maior capacidade operacional
- use benchmark somente para estimativas INTERNAS de priorização
- nenhuma estimativa financeira pode ser tratada como fato na abordagem externa
- retorne APENAS o JSON, sem texto adicional`;

  try {
    const response = await callOpenAI(
      params.tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.3 },
    );

    const content = response.content ?? "{}";
    const parsed = JSON.parse(content) as ScoreResult;

    // Validate/clamp score
    parsed.propensity_score = Math.min(100, Math.max(0, Number(parsed.propensity_score) || 50));
    return parsed;
  } catch {
    // Fallback heuristic score
    let score = 50;
    if (!digital.indicio_crm) score += 15;
    if (!digital.tem_site) score += 10;
    if (growth.multiplas_unidades) score += 10;
    if (growth.reviews_velocity > 5) score += 10;
    score = Math.min(100, score);

    return {
      propensity_score: score,
      score_breakdown: { dor_operacional: 25, momento_expansao: 15, capacidade_pagamento: 10 },
      priority_reason: "Prospect com sinais externos de oportunidade detectados automaticamente.",
      roi_estimate: {
        volume_atendimentos_mes: benchmark?.volumeMedioAtendimentos ?? 200,
        perda_estimada_mes: Number(benchmark?.perdaEstimadaPorLeadPerdido ?? 100) * 20,
        ganho_potencial_mes: Number(benchmark?.perdaEstimadaPorLeadPerdido ?? 100) * 16,
        ticket_estimado: "PME",
      },
    };
  }
}

// ── Main enrichment orchestrator ───────────────────────────────────────────

export interface EnrichLeadParams {
  leadId: string;
  tenantId: string;
  log?: Logger;
  scoreBoost?: number;
  boostReason?: string;
}

export async function enrichLead(
  paramsOrId: EnrichLeadParams | string,
  tenantIdArg?: string,
  logArg: Logger = rootLogger,
): Promise<void> {
  // Support both new object API and legacy positional API
  let leadId: string, tenantId: string, log: Logger, scoreBoost: number, boostReason: string;
  if (typeof paramsOrId === "string") {
    leadId = paramsOrId;
    tenantId = tenantIdArg!;
    log = logArg;
    scoreBoost = 0;
    boostReason = "";
  } else {
    leadId = paramsOrId.leadId;
    tenantId = paramsOrId.tenantId;
    log = paramsOrId.log ?? rootLogger;
    scoreBoost = paramsOrId.scoreBoost ?? 0;
    boostReason = paramsOrId.boostReason ?? "";
  }

  log.info({ leadId, tenantId }, "enrichLead: starting");

  // Load lead with tenant ownership enforced. Enrichment must never read or
  // mutate a lead that belongs to another tenant even if an id is reused by a
  // malformed internal call.
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) {
    log.warn({ leadId, tenantId }, "enrichLead: lead not found for tenant");
    return;
  }

  // Detect vertical from mercadoSegmento or metadata setor
  const rawSegmento = (lead.mercadoSegmento ?? (lead.metadata as Record<string, unknown>)?.["setor"] ?? "geral") as string;
  const segmento = rawSegmento.toLowerCase().replace(/\s+/g, "_");

  try {
    // Phase 2A: Digital Scanner
    const digital = await runDigitalScanner({
      websiteUrl: lead.websiteUrl,
      instagramHandle: lead.instagramHandle,
      metadata: lead.metadata as Record<string, unknown> | null,
    });

    // Phase 2B: Growth Radar
    const growth = runGrowthRadar({
      metadata: lead.metadata as Record<string, unknown> | null,
      discoveryData: lead.discoveryData as Record<string, unknown> | null,
    });

    // Phase 2C: Meta Ads check + Google presence cross-reference.
    // A lead discovered in Ad Library already carries a verified ad signal, so it does not
    // depend on a global token being available again during enrichment.
    const leadMetadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const metaAdvertiserSignal =
      lead.source === "ad_library" ||
      leadMetadata["origem"] === "ad_library" ||
      leadMetadata["meta_anunciante_ativo"] === true ||
      Boolean(leadMetadata["meta_page_id"]);
    const constructionActorIsBusiness =
      lead.source === "construction_radar" &&
      leadMetadata["construction_actor_type"] === "empresa";
    const constructionActorNeedsNoGoogleAssumption =
      lead.source === "construction_radar" &&
      leadMetadata["construction_actor_type"] !== "empresa";
    const mustCheckGooglePresence =
      ["cnpj", "recem_aberta", "ad_library"].includes(lead.source ?? "") ||
      constructionActorIsBusiness;

    const shouldCheckMetaAds =
      lead.source !== "construction_radar" || constructionActorIsBusiness;

    const [metaAds, googlePresence] = await Promise.allSettled([
      metaAdvertiserSignal
        ? Promise.resolve(true)
        : shouldCheckMetaAds
          ? checkHasMetaAds(lead.empresa ?? lead.nome)
          : Promise.resolve(false),
      mustCheckGooglePresence
        ? checkGooglePresence(lead.empresa ?? lead.nome, leadMetadata["cidade"] as string ?? "")
        : constructionActorNeedsNoGoogleAssumption
          ? Promise.resolve(false)
          : Promise.resolve(true), // Google Places-origin leads are already verified there
    ]);

    growth.anuncios_ativos = metaAds.status === "fulfilled" ? metaAds.value : metaAdvertiserSignal;
    const temPresencaGoogle = googlePresence.status === "fulfilled" ? googlePresence.value : true;
    digital.presenca_google = temPresencaGoogle;

    // Non-Google discovery with no Places presence → flag as digitally invisible.
    if (mustCheckGooglePresence && !temPresencaGoogle) {
      lead.priorityReason = lead.priorityReason
        ? `${lead.priorityReason} • Sem presença no Google`
        : "Empresa ativa sem presença digital";
    }

    // Save enrichment_data + mark enriched
    await db.update(leadsTable)
      .set({
        enrichmentData: {
          digital,
          growth,
          signals: { origem: lead.source, meta_anunciante: metaAdvertiserSignal },
          enriquecido_em: new Date().toISOString(),
        },
        enrichmentStatus: "enriched",
        ...(lead.priorityReason ? { priorityReason: lead.priorityReason } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    log.info({ leadId, digital, growth }, "enrichLead: enrichment saved");

    // Phase 3: Propensity Score + ROI
    const [benchmark] = await db
      .select()
      .from(segmentBenchmarksTable)
      .where(eq(segmentBenchmarksTable.segmento, segmento))
      .limit(1);

    const scoreResult = await scoreLead({
      lead,
      digital,
      growth,
      benchmark: benchmark ?? null,
      tenantId,
    });

    // Apply boost from Cmd 23 (recém-abertas, ad-library, etc.)
    if (scoreBoost > 0) {
      scoreResult.propensity_score = Math.min(100, scoreResult.propensity_score + scoreBoost);
      if (boostReason === "empresa_recem_aberta") {
        scoreResult.priority_reason = scoreResult.priority_reason
          ? `${scoreResult.priority_reason} (+${scoreBoost} pts: empresa recém-aberta)`
          : `Empresa recém-aberta — oportunidade de primeiro sistema`;
      } else if (boostReason === "meta_advertiser") {
        scoreResult.priority_reason = scoreResult.priority_reason
          ? `${scoreResult.priority_reason} (+${scoreBoost} pts: anunciante Meta/Instagram)`
          : `Anunciante Meta/Instagram ativo (+${scoreBoost} pts)`;
      } else if (boostReason === "construction_radar_signal") {
        const radarReason = String(leadMetadata["construction_priority_reason"] ?? "sinal público de obra");
        scoreResult.priority_reason = scoreResult.priority_reason
          ? `${radarReason} • ${scoreResult.priority_reason} (+${scoreBoost} pts: Radar de Obras)`
          : `${radarReason} (+${scoreBoost} pts: Radar de Obras)`;
      }
    }

    // Boost +10 if has active Meta Ads (has marketing budget)
    if (growth.anuncios_ativos) {
      scoreResult.propensity_score = Math.min(100, scoreResult.propensity_score + 10);
      scoreResult.priority_reason = scoreResult.priority_reason
        ? `${scoreResult.priority_reason} • Investindo em anúncios`
        : "Investindo em anúncios — sinal público de atividade de marketing";
    }

    // Boost +15 if no Google presence (invisible = maximum pain)
    if (!digital.presenca_google && mustCheckGooglePresence) {
      scoreResult.propensity_score = Math.min(100, scoreResult.propensity_score + 15);
    }

    // Boost +0..15 from vector similarity with previously converted leads
    const similarityBonus = await getSimilarityBonus(tenantId, {
      nome: lead.nome,
      segmento: lead.mercadoSegmento,
      websiteUrl: lead.websiteUrl,
      endereco: lead.endereco,
      metadata: lead.metadata as Record<string, unknown> | null,
    });
    if (similarityBonus > 0) {
      scoreResult.propensity_score = Math.min(100, scoreResult.propensity_score + similarityBonus);
      scoreResult.priority_reason = scoreResult.priority_reason
        ? `${scoreResult.priority_reason} • Similar a clientes convertidos (+${similarityBonus} pts)`
        : `Similar a clientes convertidos (+${similarityBonus} pts)`;
    }

    // Load the tenant threshold before persisting the dossier. The cold-prospect
    // gate uses the same threshold as the dispatch decision so the UI and the
    // automation cannot disagree about readiness.
    const [config] = await db
      .select({ autoDispatchThreshold: prospectorConfigTable.autoDispatchThreshold })
      .from(prospectorConfigTable)
      .where(eq(prospectorConfigTable.tenantId, tenantId))
      .limit(1);

    const threshold = config?.autoDispatchThreshold ?? 80;
    const quality = evaluateColdProspectQuality({
      segmento: rawSegmento,
      telefone: lead.telefone,
      email: lead.email,
      instagramHandle: lead.instagramHandle,
      websiteUrl: lead.websiteUrl,
      source: lead.source,
      metadata: leadMetadata,
      digital,
      growth,
      propensityScore: scoreResult.propensity_score,
      dispatchThreshold: threshold,
    });

    const dossier = {
      version: 1,
      generatedAt: new Date().toISOString(),
      status: quality.status,
      fitScore: quality.fitScore,
      painScore: quality.painScore,
      propensityScore: scoreResult.propensity_score,
      intentScore: Number(lead.intentScore ?? 0),
      evidenceCount: quality.evidenceCount,
      requiredEvidence: quality.requiredEvidence,
      hasValidContact: quality.hasValidContact,
      segmentIdentified: quality.segmentIdentified,
      blockingReasons: quality.reasons,
      evidence: quality.evidence,
      playbook: quality.playbook,
      publicDiagnosticPolicy: {
        factsOnly: true,
        financialEstimatesAreInternal: true,
        unverifiableInternalOperations: "do_not_claim",
        unknownDataLabel: "Não verificável com dados públicos",
      },
      lpBrief: {
        ready: quality.ready,
        companyName: lead.empresa ?? lead.nome,
        segment: quality.playbook.segment,
        niche: quality.playbook.niche,
        city: leadMetadata["cidade"] ?? lead.endereco ?? null,
        logoUrl: lead.logoUrl ?? null,
        websiteUrl: lead.websiteUrl ?? null,
        evidenceKeys: quality.evidence.map((item) => item.key),
        modules: quality.playbook.recommendedModules,
        primaryCta: "Quero ver minha empresa funcionando no VendorAI",
      },
    };

    await db.update(leadsTable)
      .set({
        propensityScore: scoreResult.propensity_score,
        roiEstimate: scoreResult.roi_estimate,
        priorityReason: scoreResult.priority_reason,
        metadata: {
          ...leadMetadata,
          coldProspectDossier: dossier,
        },
        enrichmentData: {
          digital,
          growth,
          signals: { origem: lead.source, meta_anunciante: metaAdvertiserSignal },
          score_breakdown: scoreResult.score_breakdown,
          enriquecido_em: new Date().toISOString(),
        },
        enrichmentStatus: "scored",
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    log.info(
      {
        leadId,
        score: scoreResult.propensity_score,
        fitScore: quality.fitScore,
        painScore: quality.painScore,
        evidenceCount: quality.evidenceCount,
        qualityStatus: quality.status,
      },
      "enrichLead: score and cold prospect dossier saved",
    );

    // Phase 4: Auto-dispatch ONLY when score and evidence quality both pass.
    // A high score alone never authorizes cold outreach.
    if (quality.ready) {
      log.info(
        { leadId, score: scoreResult.propensity_score, threshold, evidenceCount: quality.evidenceCount },
        "enrichLead: quality gate passed — auto-dispatching SDR",
      );

      // Load vertical profile for context
      const [verticalProfile] = await db
        .select({ aberturaPadrao: sdrVerticalProfilesTable.aberturaPadrao })
        .from(sdrVerticalProfilesTable)
        .where(eq(sdrVerticalProfilesTable.vertical, segmento))
        .limit(1);

      const sinalPrincipal = growth.multiplas_unidades
        ? "expansão com múltiplas unidades"
        : growth.reviews_velocity > 5
          ? "volume relevante de avaliações públicas"
          : digital.tem_agendamento_online
            ? "agendamento digital detectado"
            : growth.anuncios_ativos
              ? "atividade de mídia paga detectada"
              : digital.tem_site
                ? "presença digital identificada"
                : "oportunidade comercial externa identificada";

      const evidenceSummary = quality.evidence
        .slice(0, 3)
        .map((item) => item.label)
        .join("; ");

      const trigger = verticalProfile
        ? `${COLD_OUTREACH_TRIGGER} Sinal principal: ${sinalPrincipal}. Evidências verificadas: ${evidenceSummary}.`
        : `${COLD_OUTREACH_TRIGGER} Evidências verificadas: ${evidenceSummary}.`;

      // Prefer the canonical SDR service for the first approach because it
      // records the activity marker consumed by the 48h follow-up job. When a
      // template cannot use that flow, keep the existing AI dispatch as a safe
      // fallback — but only AFTER the evidence gate has passed.
      const firstApproach = await sendSdrFirstApproach(leadId, null, tenantId, log);
      if (!firstApproach.sent && !firstApproach.queuedForApproval) {
        dispatchAgentBackground({
          tenantId,
          leadId,
          mensagem: trigger,
          log,
          forcedAgent: "sdr",
          scenario: {
            cold_outreach: true,
            origem: "prospector_predictive",
            propensity_score: scoreResult.propensity_score,
            fit_score: quality.fitScore,
            pain_score: quality.painScore,
            evidence_count: quality.evidenceCount,
            evidence: quality.evidence.slice(0, 5),
            sinal_growth_principal: sinalPrincipal,
            segmento,
          },
        });
      }

      await db.update(leadsTable)
        .set({
          enrichmentStatus: firstApproach.queuedForApproval ? "scored" : "dispatched",
          updatedAt: new Date(),
        })
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));
    } else {
      log.info(
        {
          leadId,
          qualityStatus: quality.status,
          blockingReasons: quality.reasons,
          evidenceCount: quality.evidenceCount,
          score: scoreResult.propensity_score,
          threshold,
        },
        "enrichLead: cold outreach blocked by quality gate",
      );
    }
  } catch (err) {
    log.error({ err, leadId, tenantId }, "enrichLead: error");
    // Don't rethrow — fire-and-forget job
  }
}
