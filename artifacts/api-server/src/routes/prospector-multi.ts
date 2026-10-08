import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { activitiesTable, db, leadsTable, prospectorConfigTable } from "@workspace/db";
import { ensureColdProspectLandingPage } from "../services/coldProspectLandingPage.js";
import type { ColdEvidence } from "../lib/coldProspectQuality.js";

const router: IRouter = Router();
const PILOT_VALIDATION_FIT = 70;
const PILOT_VALIDATION_PROPENSITY = 50;
const PILOT_VALIDATION_EVIDENCE = 2;

function resolveTenantId(req: Express.Request, explicitTenantId?: string): string {
  const user = req.user;
  if (!user) throw Object.assign(new Error("Não autenticado"), { status: 401 });
  if (user.platformRole === "super_admin") {
    const tenantId = explicitTenantId ?? user.tenantId ?? undefined;
    if (!tenantId) throw Object.assign(new Error("tenantId é obrigatório para super_admin"), { status: 400 });
    return tenantId;
  }
  if (!user.tenantId) throw Object.assign(new Error("Usuário sem tenant associado"), { status: 403 });
  return user.tenantId;
}

function cleanUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (value.length < 2) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function getDossier(metadata: Record<string, unknown>): Record<string, unknown> {
  const raw = metadata["coldProspectDossier"];
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function getEvidence(dossier: Record<string, unknown>): ColdEvidence[] {
  const raw = dossier["evidence"];
  return Array.isArray(raw) ? raw as ColdEvidence[] : [];
}

function validationStage(params: {
  dossier: Record<string, unknown>;
  evidenceCount: number;
  propensityScore: number;
}): "ready_for_outreach" | "ready_for_validation" | "needs_enrichment" | "below_validation_score" {
  const { dossier, evidenceCount, propensityScore } = params;
  if (String(dossier["status"] ?? "") === "ready_for_outreach") return "ready_for_outreach";
  const fitScore = Number(dossier["fitScore"] ?? 0);
  const hasValidContact = dossier["hasValidContact"] !== false;
  const segmentIdentified = dossier["segmentIdentified"] !== false;
  if (!hasValidContact || !segmentIdentified || evidenceCount < PILOT_VALIDATION_EVIDENCE) return "needs_enrichment";
  if (fitScore >= PILOT_VALIDATION_FIT && propensityScore >= PILOT_VALIDATION_PROPENSITY) return "ready_for_validation";
  return "below_validation_score";
}

const geoAreaSchema = z.object({
  label: z.string().min(2).max(180),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().int().min(1).max(100),
});

const multiConfigSchema = z.object({
  setores: z.array(z.string()).max(10),
  cidades: z.array(z.string()).max(20),
  geoAreas: z.array(geoAreaSchema).max(20).optional().default([]),
  ritmoDiario: z.number().int().min(1).max(500),
  ativo: z.boolean(),
  tenantId: z.string().optional(),
});

router.get("/prospector/config-multi", async (req, res) => {
  try {
    const explicitTenantId = typeof req.query["tenantId"] === "string" ? req.query["tenantId"] : undefined;
    const tenantId = resolveTenantId(req, explicitTenantId);
    const rows = await db
      .select()
      .from(prospectorConfigTable)
      .where(eq(prospectorConfigTable.tenantId, tenantId))
      .orderBy(asc(prospectorConfigTable.createdAt));

    const setores = cleanUnique(rows.map((row) => row.setor ?? "").filter(Boolean));
    const cidades = cleanUnique(rows.map((row) => row.cidade ?? "").filter(Boolean));
    const ritmoDiario = rows[0]?.ritmoDiario ?? 10;
    const ativo = rows.some((row) => row.ativo);
    const geoAreas = rows
      .filter((row) => row.cidade && row.latitude != null && row.longitude != null && row.raioKm != null)
      .map((row) => ({
        label: row.cidade!,
        lat: row.latitude!,
        lng: row.longitude!,
        radiusKm: row.raioKm!,
      }))
      .filter((area, index, all) =>
        all.findIndex((item) =>
          item.label.toLocaleLowerCase("pt-BR") === area.label.toLocaleLowerCase("pt-BR") &&
          item.lat === area.lat &&
          item.lng === area.lng &&
          item.radiusKm === area.radiusKm
        ) === index
      );

    return res.status(200).json({
      config: {
        setores,
        cidades,
        ritmoDiario,
        ativo,
        geoAreas,
        combinacoes: rows
          .filter((row) => row.setor && row.cidade)
          .map((row) => ({ id: row.id, setor: row.setor, cidade: row.cidade, ativo: row.ativo })),
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao carregar configuração";
    return res.status(status).json({ error: message });
  }
});

router.get("/prospector/pilot-validation", async (req, res) => {
  try {
    const explicitTenantId = typeof req.query["tenantId"] === "string" ? req.query["tenantId"] : undefined; // tenant-audit: reviewed resolveTenantId accepts explicit tenant only for super_admin
    const tenantId = resolveTenantId(req, explicitTenantId);
    const coldSources = ["prospector", "prospector_auto", "cnpj", "recem_aberta", "ad_library"];

    const leads = await db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        email: leadsTable.email,
        source: leadsTable.source,
        mercadoSegmento: leadsTable.mercadoSegmento,
        endereco: leadsTable.endereco,
        enrichmentStatus: leadsTable.enrichmentStatus,
        propensityScore: leadsTable.propensityScore,
        intentScore: leadsTable.intentScore,
        priorityReason: leadsTable.priorityReason,
        proximaAcao: leadsTable.proximaAcao,
        metadata: leadsTable.metadata,
        createdAt: leadsTable.createdAt,
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.source, coldSources)))
      .orderBy(desc(leadsTable.createdAt))
      .limit(5);

    const leadIds = leads.map((lead) => lead.id);
    const activities = leadIds.length
      ? await db
          .select({
            leadId: activitiesTable.leadId,
            tipo: activitiesTable.tipo,
            titulo: activitiesTable.titulo,
            descricao: activitiesTable.descricao,
            status: activitiesTable.status,
            createdAt: activitiesTable.createdAt,
          })
          .from(activitiesTable)
          .where(and(eq(activitiesTable.tenantId, tenantId), inArray(activitiesTable.leadId, leadIds)))
          .orderBy(desc(activitiesTable.createdAt))
      : [];

    const latestByLead = new Map<string, (typeof activities)[number]>();
    for (const activity of activities) {
      if (!latestByLead.has(activity.leadId)) latestByLead.set(activity.leadId, activity);
    }

    const prospects = leads.map((lead) => {
      const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
      const dossier = getDossier(metadata);
      const evidence = getEvidence(dossier);
      const blockingReasons = Array.isArray(dossier["blockingReasons"])
        ? (dossier["blockingReasons"] as unknown[]).map(String)
        : [];
      const lastActivity = latestByLead.get(lead.id);
      const lpBrief = dossier["lpBrief"] && typeof dossier["lpBrief"] === "object"
        ? dossier["lpBrief"] as Record<string, unknown>
        : {};
      const propensityScore = Number(lead.propensityScore ?? 0);
      const stage = validationStage({ dossier, evidenceCount: evidence.length, propensityScore });

      return {
        id: lead.id,
        name: lead.empresa ?? lead.nome,
        contact: lead.telefone ?? lead.email ?? null,
        city: typeof lpBrief["city"] === "string" ? lpBrief["city"] : lead.endereco,
        segment: lead.mercadoSegmento,
        source: lead.source,
        enrichmentStatus: lead.enrichmentStatus,
        propensityScore,
        fitScore: Number(dossier["fitScore"] ?? 0),
        painScore: Number(dossier["painScore"] ?? 0),
        intentScore: Number(lead.intentScore ?? dossier["intentScore"] ?? 0),
        dossierStatus: String(dossier["status"] ?? "aguardando_dossie"),
        validationStage: stage,
        validationCriteria: {
          minFit: PILOT_VALIDATION_FIT,
          minPropensity: PILOT_VALIDATION_PROPENSITY,
          minEvidence: PILOT_VALIDATION_EVIDENCE,
        },
        evidenceCount: evidence.length,
        evidence: evidence.slice(0, 4),
        lpUrl: typeof dossier["lpUrl"] === "string" ? dossier["lpUrl"] : null,
        blockingReasons,
        validationBlockingReasons: stage === "ready_for_validation"
          ? blockingReasons.filter((reason) => reason !== "score_abaixo_do_threshold")
          : blockingReasons,
        priorityReason: lead.priorityReason,
        nextAction: lead.proximaAcao,
        lastActivity: lastActivity ? {
          type: lastActivity.tipo,
          title: lastActivity.titulo,
          description: lastActivity.descricao,
          status: lastActivity.status,
          at: lastActivity.createdAt,
        } : null,
        createdAt: lead.createdAt,
      };
    });

    return res.status(200).json({ prospects, limit: 5 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao carregar validação do piloto";
    return res.status(status).json({ error: message });
  }
});

const validationLpSchema = z.object({ tenantId: z.string().optional() });

router.post("/prospector/pilot-validation/:leadId/lp", async (req, res) => {
  const parsed = validationLpSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

  try {
    const tenantId = resolveTenantId(req, parsed.data.tenantId);
    const leadId = req.params["leadId"]!;
    const [lead] = await db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        email: leadsTable.email,
        mercadoSegmento: leadsTable.mercadoSegmento,
        endereco: leadsTable.endereco,
        logoUrl: leadsTable.logoUrl,
        websiteUrl: leadsTable.websiteUrl,
        propensityScore: leadsTable.propensityScore,
        metadata: leadsTable.metadata,
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: "Prospect não encontrado" });

    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const dossier = getDossier(metadata);
    const evidence = getEvidence(dossier);
    const propensityScore = Number(lead.propensityScore ?? dossier["propensityScore"] ?? 0);
    const stage = validationStage({ dossier, evidenceCount: evidence.length, propensityScore });

    if (stage !== "ready_for_validation" && stage !== "ready_for_outreach") {
      return res.status(409).json({
        error: stage === "needs_enrichment"
          ? "Complete o enriquecimento antes de gerar a LP."
          : "Prospect ainda não atingiu os critérios mínimos de validação.",
      });
    }

    if (typeof dossier["lpUrl"] === "string" && dossier["lpUrl"]) {
      return res.status(200).json({ lpUrl: dossier["lpUrl"], reused: true, validationStage: stage });
    }

    const playbook = dossier["playbook"] && typeof dossier["playbook"] === "object"
      ? dossier["playbook"] as Record<string, unknown>
      : {};
    const lpBrief = dossier["lpBrief"] && typeof dossier["lpBrief"] === "object"
      ? dossier["lpBrief"] as Record<string, unknown>
      : {};
    const modules = Array.isArray(playbook["recommendedModules"])
      ? (playbook["recommendedModules"] as unknown[]).map(String)
      : ["crm", "sdr", "follow_up", "marketing", "jarvis"];

    const landing = await ensureColdProspectLandingPage({
      tenantId,
      leadId,
      companyName: lead.empresa ?? lead.nome,
      city: typeof lpBrief["city"] === "string" ? lpBrief["city"] : lead.endereco,
      niche: String(playbook["niche"] ?? lead.mercadoSegmento ?? "geral"),
      segment: String(playbook["segment"] ?? lead.mercadoSegmento ?? "geral"),
      logoUrl: lead.logoUrl,
      websiteUrl: lead.websiteUrl,
      evidence,
      modules,
      fitScore: Number(dossier["fitScore"] ?? 0),
      painScore: Number(dossier["painScore"] ?? 0),
    });

    const updatedDossier = {
      ...dossier,
      validationStage: stage,
      lpUrl: landing.publicUrl,
      lpSiteId: landing.id,
      lpSlug: landing.siteSlug,
      lpGeneratedAt: new Date().toISOString(),
      lpPreparedForReview: stage === "ready_for_validation",
    };

    await db
      .update(leadsTable)
      .set({
        metadata: { ...metadata, coldProspectDossier: updatedDossier },
        proximaAcao: stage === "ready_for_validation"
          ? "Revisar LP e abordagem antes do disparo"
          : "Aguardar execução do SDR",
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    return res.status(200).json({ lpUrl: landing.publicUrl, reused: false, validationStage: stage });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao gerar LP para validação";
    return res.status(status).json({ error: message });
  }
});

router.put("/prospector/config-multi", async (req, res) => {
  const parsed = multiConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  try {
    const tenantId = resolveTenantId(req, parsed.data.tenantId);
    const setores = cleanUnique(parsed.data.setores);
    const cidades = cleanUnique(parsed.data.cidades);
    const geoAreas = parsed.data.geoAreas.filter((area) =>
      cidades.some((cidade) => cidade.toLocaleLowerCase("pt-BR") === area.label.toLocaleLowerCase("pt-BR"))
    );
    const totalCombinacoes = setores.length * cidades.length;

    if (parsed.data.ativo && (setores.length === 0 || cidades.length === 0)) {
      return res.status(400).json({ error: "Adicione pelo menos um nicho e uma localidade antes de ativar a busca automática." });
    }
    if (totalCombinacoes > 60) {
      return res.status(400).json({ error: "Use no máximo 60 combinações de nicho × localidade por configuração automática." });
    }

    const [strategyConfig] = await db.select().from(prospectorConfigTable)
      .where(eq(prospectorConfigTable.tenantId, tenantId))
      .limit(1);
    const strategy = strategyConfig ? {
      coldProspectingMode: strategyConfig.coldProspectingMode,
      allowedSolutions: strategyConfig.allowedSolutions,
      targetSegments: strategyConfig.targetSegments,
      targetPersonas: strategyConfig.targetPersonas,
      allowedChannels: strategyConfig.allowedChannels,
      contactWindowStart: strategyConfig.contactWindowStart,
      contactWindowEnd: strategyConfig.contactWindowEnd,
      timezone: strategyConfig.timezone,
      maxContactsPerPerson7d: strategyConfig.maxContactsPerPerson7d,
      qualificationThreshold: strategyConfig.qualificationThreshold,
      meetingReadinessThreshold: strategyConfig.meetingReadinessThreshold,
      autoSendApprovedContent: strategyConfig.autoSendApprovedContent,
      conversionCriteria: strategyConfig.conversionCriteria,
    } : {};

    await db.transaction(async (tx) => {
      await tx.delete(prospectorConfigTable).where(eq(prospectorConfigTable.tenantId, tenantId));

      if (setores.length > 0 && cidades.length > 0) {
        const combinations = setores.flatMap((setor) =>
          cidades.map((cidade) => {
            const geo = geoAreas.find((area) => area.label.toLocaleLowerCase("pt-BR") === cidade.toLocaleLowerCase("pt-BR"));
            return {
              tenantId,
              setor,
              cidade,
              raioKm: geo?.radiusKm ?? null,
              latitude: geo?.lat ?? null,
              longitude: geo?.lng ?? null,
              ritmoDiario: parsed.data.ritmoDiario,
              ativo: parsed.data.ativo,
              ...strategy,
            };
          }),
        );
        await tx.insert(prospectorConfigTable).values(combinations);
      } else {
        await tx.insert(prospectorConfigTable).values({
          tenantId,
          setor: setores[0] ?? null,
          cidade: cidades[0] ?? null,
          ritmoDiario: parsed.data.ritmoDiario,
          ativo: false,
          ...strategy,
        });
      }
    });

    return res.status(200).json({
      config: {
        setores,
        cidades,
        ritmoDiario: parsed.data.ritmoDiario,
        ativo: parsed.data.ativo && totalCombinacoes > 0,
        geoAreas,
        totalCombinacoes,
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao salvar configuração";
    return res.status(status).json({ error: message });
  }
});

const leadTagsSchema = z.object({
  nichos: z.array(z.string()).max(20).default([]),
  localidades: z.array(z.string()).max(30).default([]),
  fonte: z.string().min(2).max(80).default("Prospector"),
  tenantId: z.string().optional(),
});

function stringsFromMetadata(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

router.post("/prospector/leads/:leadId/tags", async (req, res) => {
  const parsed = leadTagsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  try {
    const tenantId = resolveTenantId(req, parsed.data.tenantId);
    const leadId = req.params["leadId"]!;
    const [lead] = await db
      .select({ id: leadsTable.id, metadata: leadsTable.metadata, mercadoSegmento: leadsTable.mercadoSegmento })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: "Lead não encontrado para este tenant" });

    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const nichos = cleanUnique([...stringsFromMetadata(metadata, "prospector_nichos"), ...parsed.data.nichos]);
    const localidades = cleanUnique([...stringsFromMetadata(metadata, "prospector_localidades"), ...parsed.data.localidades]);
    const fontes = cleanUnique([...stringsFromMetadata(metadata, "prospector_fontes"), parsed.data.fonte]);
    const existingTags = stringsFromMetadata(metadata, "tags");
    const tags = cleanUnique([...existingTags, ...nichos, ...localidades, ...fontes]);

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      tags,
      prospector_nichos: nichos,
      prospector_localidades: localidades,
      prospector_fontes: fontes,
      prospector_tags: [
        ...nichos.map((valor) => ({ tipo: "atividade", valor })),
        ...localidades.map((valor) => ({ tipo: "localidade", valor })),
        ...fontes.map((valor) => ({ tipo: "fonte", valor })),
      ],
      prospector_tags_atualizadas_em: new Date().toISOString(),
    };

    await db
      .update(leadsTable)
      .set({
        metadata: nextMetadata,
        mercadoSegmento: lead.mercadoSegmento ?? nichos[0] ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    return res.status(200).json({ leadId, tags, nichos, localidades, fontes });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao atualizar tags do prospect";
    return res.status(status).json({ error: message });
  }
});

export default router;
