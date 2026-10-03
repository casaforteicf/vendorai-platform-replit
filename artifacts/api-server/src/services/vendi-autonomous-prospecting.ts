import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  cnaeVerticalMapTable,
  db,
  agentConfigsTable,
  prospectorConfigTable,
  prospectorQueueTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { searchProspectorCompanies } from "./prospector-company-search.js";
import { searchByCnae } from "./cnpjService.js";
import { searchConstructionWorkSignals } from "./construction-radar-search.js";
import { getLaunchRevenueScout } from "./launchRevenueScout.js";\nimport { runRecemAbertas } from "../jobs/recemAbertasJob.js";
import { upsertProspectingSignal } from "./prospecting-signal-ingest.js";

type DiscoverySource = "google_places";

function stableId(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|").toLocaleLowerCase("pt-BR"))
    .digest("hex")
    .slice(0, 32);
}

async function queueCompany(input: {
  tenantId: string;
  source: DiscoverySource;
  externalId: string;
  nome: string;
  telefone?: string | null;
  endereco?: string | null;
  setor?: string | null;
  cidade?: string | null;
  website?: string | null;
}) {
  const placeId = `${input.source}:${input.externalId}`;
  const [existing] = await db
    .select({ id: prospectorQueueTable.id })
    .from(prospectorQueueTable)
    .where(and(
      eq(prospectorQueueTable.tenantId, input.tenantId),
      eq(prospectorQueueTable.placeId, placeId),
    ))
    .limit(1);

  if (existing) return { queued: false, duplicate: true };

  await db.insert(prospectorQueueTable).values({
    tenantId: input.tenantId,
    placeId,
    nome: input.nome,
    telefone: input.telefone ?? null,
    endereco: input.endereco ?? null,
    setor: input.setor ?? null,
    cidade: input.cidade ?? null,
    website: input.website ?? null,
    status: "pendente",
    dadosCompletos: Boolean(input.nome && (input.telefone || input.website)),
  });
  return { queued: true, duplicate: false };
}

function constructionRelevant(setor: string) {
  return /(constru|arquitet|engenhar|esquadr|piscin|revest|m[oó]ve|imobili|material|telhado|solar|el[eé]tric|hidr[aá]ul)/i.test(setor);
}

export async function runAutonomousProspectingCycle(input: {
  tenantId: string;
  log: Logger;
  maxPerConfig?: number;
}) {
  const maxPerConfig = Math.min(Math.max(Number(input.maxPerConfig ?? 10), 3), 20);
  const configs = await db
    .select()
    .from(prospectorConfigTable)
    .where(and(
      eq(prospectorConfigTable.tenantId, input.tenantId),
      eq(prospectorConfigTable.ativo, true),
    ));

  const totals = {
    configs: configs.length,
    googleFound: 0,
    cnpjFound: 0,
    queued: 0,
    duplicates: 0,
    constructionSignals: 0,
    revenueOpportunities: 0,
    sourceErrors: [] as Array<{ source: string; message: string }>,
  };

  for (const config of configs) {
    const setor = (config.setor ?? "").trim();
    const cidade = (config.cidade ?? "").trim();
    if (!setor || !cidade) continue;

    try {
      const google = await searchProspectorCompanies({
        atividade: setor,
        localidade: cidade,
        maxResults: maxPerConfig,
      });
      totals.googleFound += google.results.length;
      for (const company of google.results) {
        const externalId = stableId([company.nomeEmpresa, company.endereco, company.telefone, company.siteOficial]);
        const queued = await queueCompany({
          tenantId: input.tenantId,
          source: "google_places",
          externalId,
          nome: company.nomeEmpresa,
          telefone: company.telefone,
          endereco: company.endereco,
          setor,
          cidade,
          website: company.siteOficial,
        });
        if (queued.queued) totals.queued++;
        if (queued.duplicate) totals.duplicates++;
      }
    } catch (error: any) {
      totals.sourceErrors.push({ source: "google_places", message: error?.message ?? "falha" });
    }


    if (constructionRelevant(setor)) {
      try {
        const radar = await searchConstructionWorkSignals({
          tenantId: input.tenantId,
          category: "construcao",
          model: "obra privada",
          locality: cidade,
          productInterest: setor,
          maxResults: Math.min(maxPerConfig, 10),
        });
        totals.constructionSignals += radar.works.length;
        for (const work of radar.works) {
          await upsertProspectingSignal({
            tenantId: input.tenantId,
            source: "construction_radar",
            externalKey: work.id,
            category: "prospecting_construction",
            title: work.obra,
            detail: [
              work.local,
              work.fase ? "Fase: " + work.fase : "",
              work.evidencia,
            ].filter(Boolean).join(" · "),
            confidence: work.confidence,
            impact: work.opportunityScore,
            href: work.sourceUrl,
            evidence: {
              sourceTitle: work.sourceTitle,
              sourceFamily: work.sourceFamily,
              sourceAuthority: work.sourceAuthority,
              endereco: work.endereco ?? null,
              proprietario: work.proprietario ?? null,
              responsavelTecnico: work.responsavelTecnico ?? null,
              construtora: work.construtora ?? null,
              incorporadora: work.incorporadora ?? null,
              fase: work.fase ?? null,
              priority: work.priority,
              priorityReason: work.priorityReason,
              recommendedActor: work.recommendedActor,
            },
            recommendedAction: "Validar ator recomendado, enriquecer contato e iniciar diagnóstico consultivo somente com evidência suficiente.",
          });
        }
      } catch (error: any) {
        totals.sourceErrors.push({ source: "construction_radar", message: error?.message ?? "falha" });
      }
    }
  }

  try {
    const fresh = await runRecemAbertas(input.log, input.tenantId);
    totals.cnpjFound = fresh.created;
  } catch (error: any) {
    totals.sourceErrors.push({ source: "cnpj_new_companies", message: error?.message ?? "falha" });
  }

  try {
    const scout = await getLaunchRevenueScout(input.tenantId, { period: "30d" } as any);
    const raw = scout as any;
    totals.revenueOpportunities =
      Number.isFinite(Number(raw?.opportunities))
        ? Number(raw.opportunities)
        : Array.isArray(raw?.topOpportunities)
          ? raw.topOpportunities.length
          : Array.isArray(raw?.oportunidades)
            ? raw.oportunidades.length
            : Array.isArray(raw?.items)
              ? raw.items.length
              : 0;
  } catch (error: any) {
    totals.sourceErrors.push({ source: "revenue_scout", message: error?.message ?? "falha" });
  }

  input.log.info({ tenantId: input.tenantId, ...totals }, "vendi/prospecting: autonomous discovery cycle complete");
  return totals;
}


export async function runAutonomousProspectingAllTenants(log: Logger) {
  const tenants = await db
    .selectDistinct({ tenantId: prospectorConfigTable.tenantId })
    .from(prospectorConfigTable)
    .innerJoin(agentConfigsTable, eq(agentConfigsTable.tenantId, prospectorConfigTable.tenantId))
    .where(and(
      eq(prospectorConfigTable.ativo, true),
      sql`${agentConfigsTable.autonomyEnabledAt} IS NOT NULL`,
    ));

  const summary = {
    tenants: tenants.length,
    processed: 0,
    queued: 0,
    googleFound: 0,
    cnpjFound: 0,
    constructionSignals: 0,
    revenueOpportunities: 0,
    failed: 0,
  };

  for (const row of tenants) {
    try {
      const result = await runAutonomousProspectingCycle({
        tenantId: row.tenantId,
        log,
      });
      summary.processed++;
      summary.queued += result.queued;
      summary.googleFound += result.googleFound;
      summary.cnpjFound += result.cnpjFound;
      summary.constructionSignals += result.constructionSignals;
      summary.revenueOpportunities += result.revenueOpportunities;
    } catch (error) {
      summary.failed++;
      log.error({ err: error, tenantId: row.tenantId }, "vendi/prospecting: autonomous tenant cycle failed");
    }
  }

  log.info(summary, "vendi/prospecting: autonomous all-tenants cycle complete");
  return summary;
}
