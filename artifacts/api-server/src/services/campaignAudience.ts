import { and, eq, gt, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import {
  customerIntelligenceTable,
  db,
  dealsTable,
  leadsTable,
  webBehaviorEventsTable,
  type NumericFilter,
  type SegmentoFiltro,
} from "@workspace/db";

type CommercialJourney = {
  stage?: string;
  score?: number;
  audienceTags?: string[];
  remarketingEligible?: boolean;
};

type LeadAudienceRow = {
  id: string;
  nome: string;
  discoveryData: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function commercialJourney(discoveryData: unknown): CommercialJourney {
  const dd = record(discoveryData);
  const raw = record(dd["commercialJourney"]);
  const behavior = record(dd["behaviorIntent"]);
  return {
    stage: typeof raw["stage"] === "string" ? raw["stage"] : undefined,
    score: Number.isFinite(Number(raw["score"]))
      ? Number(raw["score"])
      : Number.isFinite(Number(behavior["score"]))
        ? Number(behavior["score"])
        : undefined,
    audienceTags: Array.isArray(raw["audienceTags"])
      ? raw["audienceTags"].filter((item): item is string => typeof item === "string")
      : [],
    remarketingEligible: typeof raw["remarketingEligible"] === "boolean"
      ? raw["remarketingEligible"]
      : undefined,
  };
}

function hasCiFilter(filtro: SegmentoFiltro | undefined): boolean {
  return Boolean(
    filtro?.churnRisk !== undefined ||
    filtro?.journeyStage !== undefined ||
    filtro?.nextBestAction !== undefined ||
    filtro?.intentAnalysis !== undefined
  );
}

export function hasCommercialAudienceFilter(filtro: SegmentoFiltro | undefined): boolean {
  return Boolean(
    filtro?.leadIds?.length ||
    filtro?.dealEtapas?.length ||
    filtro?.audienceTags?.length ||
    filtro?.commercialStages?.length ||
    filtro?.behaviorIntentMin !== undefined ||
    filtro?.remarketingEligible !== undefined
  );
}

function ciConditions(tenantId: string, filtro: SegmentoFiltro) {
  const conditions: any[] = [eq(customerIntelligenceTable.tenantId, tenantId)];
  if (filtro.journeyStage !== undefined) conditions.push(eq(customerIntelligenceTable.journeyStage, filtro.journeyStage));
  if (filtro.nextBestAction !== undefined) conditions.push(eq(customerIntelligenceTable.nextBestAction, filtro.nextBestAction));
  if (filtro.intentAnalysis !== undefined) conditions.push(eq(customerIntelligenceTable.intentAnalysis, filtro.intentAnalysis));
  if (filtro.churnRisk !== undefined) {
    const f = filtro.churnRisk as NumericFilter;
    if (typeof f === "number") conditions.push(eq(customerIntelligenceTable.churnRisk, f));
    else {
      if (f.gt !== undefined) conditions.push(gt(customerIntelligenceTable.churnRisk, f.gt));
      if (f.gte !== undefined) conditions.push(gte(customerIntelligenceTable.churnRisk, f.gte));
      if (f.lt !== undefined) conditions.push(lt(customerIntelligenceTable.churnRisk, f.lt));
      if (f.lte !== undefined) conditions.push(lte(customerIntelligenceTable.churnRisk, f.lte));
      if (f.eq !== undefined) conditions.push(eq(customerIntelligenceTable.churnRisk, f.eq));
    }
  }
  return conditions;
}

async function consentEligibleLeadIds(tenantId: string, leadIds: string[]): Promise<Set<string>> {
  const eligible = new Set<string>();
  if (!leadIds.length) return eligible;
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ leadId: webBehaviorEventsTable.leadId, metadata: webBehaviorEventsTable.metadata })
    .from(webBehaviorEventsTable)
    .where(and(
      eq(webBehaviorEventsTable.tenantId, tenantId),
      inArray(webBehaviorEventsTable.leadId, leadIds),
      gte(webBehaviorEventsTable.createdAt, since),
    ))
    .limit(20_000);

  for (const row of rows) {
    if (!row.leadId) continue;
    const meta = record(row.metadata);
    if (meta["surface"] === "site" && meta["hasAdDataConsent"] === true) {
      eligible.add(row.leadId);
    }
  }
  return eligible;
}

export async function resolveCampaignAudienceLeadIds(
  tenantId: string,
  filtro?: SegmentoFiltro,
  limit = 500,
): Promise<string[]> {
  const rows = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, discoveryData: leadsTable.discoveryData })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      isNull(leadsTable.excluidoEm),
      isNull(leadsTable.naoLeadTipo),
    ))
    .limit(Math.max(limit * 4, 2_000)) as LeadAudienceRow[];

  let candidates = rows;

  // Lead IDs explícitos sempre são restrição forte. Isso também corrige o caso
  // legado em que uma campanha do Revenue Scout podia cair em "todos os leads".
  if (filtro?.leadIds?.length) {
    const allowed = new Set(filtro.leadIds);
    candidates = candidates.filter((lead) => allowed.has(lead.id));
  }

  if (filtro && hasCiFilter(filtro) && candidates.length) {
    const ids = candidates.map((lead) => lead.id);
    const ciRows = await db
      .select({ leadId: customerIntelligenceTable.leadId })
      .from(customerIntelligenceTable)
      .where(and(...ciConditions(tenantId, filtro), inArray(customerIntelligenceTable.leadId, ids)));
    const allowed = new Set(ciRows.map((row) => row.leadId));
    candidates = candidates.filter((lead) => allowed.has(lead.id));
  }

  if (filtro?.dealEtapas?.length && candidates.length) {
    const dealRows = await db
      .select({ leadId: dealsTable.leadId })
      .from(dealsTable)
      .where(and(
        eq(dealsTable.tenantId, tenantId),
        inArray(dealsTable.leadId, candidates.map((lead) => lead.id)),
        inArray(dealsTable.etapa, filtro.dealEtapas as any[]),
      ));
    const allowed = new Set(dealRows.map((row) => row.leadId).filter((id): id is string => Boolean(id)));
    candidates = candidates.filter((lead) => allowed.has(lead.id));
  }

  if (filtro?.commercialStages?.length) {
    const stages = new Set(filtro.commercialStages);
    candidates = candidates.filter((lead) => {
      const stage = commercialJourney(lead.discoveryData).stage;
      return Boolean(stage && stages.has(stage as any));
    });
  }

  if (filtro?.behaviorIntentMin !== undefined) {
    candidates = candidates.filter((lead) => (commercialJourney(lead.discoveryData).score ?? 0) >= filtro.behaviorIntentMin!);
  }

  if (filtro?.audienceTags?.length) {
    const required = filtro.audienceTags;
    candidates = candidates.filter((lead) => {
      const tags = new Set(commercialJourney(lead.discoveryData).audienceTags ?? []);
      return required.every((tag) => tags.has(tag));
    });
  }

  if (filtro?.remarketingEligible !== undefined && candidates.length) {
    const runtimeEligible = await consentEligibleLeadIds(tenantId, candidates.map((lead) => lead.id));
    candidates = candidates.filter((lead) => {
      const stored = commercialJourney(lead.discoveryData).remarketingEligible;
      const eligible = stored === true || runtimeEligible.has(lead.id);
      return filtro.remarketingEligible ? eligible : !eligible;
    });
  }

  return candidates.slice(0, limit).map((lead) => lead.id);
}

export async function resolveCampaignAudiencePreview(
  tenantId: string,
  filtro?: SegmentoFiltro,
  limit = 500,
) {
  const leadIds = await resolveCampaignAudienceLeadIds(tenantId, filtro, limit);
  if (!leadIds.length) return { count: 0, sample: [] as Array<Record<string, unknown>> };

  const sampleLeads = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, discoveryData: leadsTable.discoveryData })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.id, leadIds.slice(0, 10))));

  const ciRows = await db
    .select({
      leadId: customerIntelligenceTable.leadId,
      churnRisk: customerIntelligenceTable.churnRisk,
      journeyStage: customerIntelligenceTable.journeyStage,
      nextBestAction: customerIntelligenceTable.nextBestAction,
    })
    .from(customerIntelligenceTable)
    .where(and(eq(customerIntelligenceTable.tenantId, tenantId), inArray(customerIntelligenceTable.leadId, leadIds.slice(0, 10))));
  const ciByLead = new Map(ciRows.map((row) => [row.leadId, row]));

  const deals = await db
    .select({ leadId: dealsTable.leadId, etapa: dealsTable.etapa })
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, tenantId), inArray(dealsTable.leadId, leadIds.slice(0, 10))));
  const dealByLead = new Map(deals.filter((row) => row.leadId).map((row) => [row.leadId!, row.etapa]));

  return {
    count: leadIds.length,
    sample: sampleLeads.map((lead) => {
      const ci = ciByLead.get(lead.id);
      const journey = commercialJourney(lead.discoveryData);
      return {
        id: lead.id,
        leadId: lead.id,
        nome: lead.nome,
        churnRisk: ci?.churnRisk ?? null,
        journeyStage: ci?.journeyStage ?? null,
        nextBestAction: ci?.nextBestAction ?? null,
        dealEtapa: dealByLead.get(lead.id) ?? null,
        commercialStage: journey.stage ?? null,
        behaviorIntentScore: journey.score ?? null,
        audienceTags: journey.audienceTags ?? [],
      };
    }),
  };
}
