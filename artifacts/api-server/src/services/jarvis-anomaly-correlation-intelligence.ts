import { and, eq, gte, inArray, or } from "drizzle-orm";
import {
  agentTasksTable,
  db,
  dealsTable,
  leadsTable,
  propostasTable,
  usersTable,
} from "@workspace/db";
import {
  loadJarvisTemporalIntelligence,
  type JarvisTemporalAnomaly,
  type JarvisTemporalIntelligence,
} from "./jarvis-temporal-intelligence.js";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const WON_STAGES = new Set(["ganho", "entregue"]);
const LOST_STAGES = new Set(["perdido", "cancelado"]);

export type JarvisCorrelationDimension = "seller" | "city" | "product" | "discount";

export type JarvisAnomalyCorrelationFinding = {
  dimension: JarvisCorrelationDimension;
  key: string;
  label: string;
  signal:
    | "created_deals"
    | "won_revenue"
    | "average_ticket"
    | "conversion"
    | "accepted_product_revenue"
    | "average_approved_discount";
  direction: "up" | "down";
  current: number;
  previous: number;
  changePercent: number | null;
  changePoints: number | null;
  sampleSize: number;
  confidence: number;
  relatedAnomalies: JarvisTemporalAnomaly["metric"][];
  evidence: "persisted_deal" | "persisted_lead" | "accepted_proposal_items" | "approved_discount_task";
  detail: string;
};

export type JarvisAnomalyCorrelationIntelligence = {
  tenantId: string;
  temporalAnomalies: number;
  findings: JarvisAnomalyCorrelationFinding[];
  coverage: {
    deals: number;
    leads: number;
    sellers: number;
    acceptedProposals: number;
    discountApprovals: number;
  };
};

type DealRow = {
  id: string;
  leadId: string | null;
  assignedTo: string | null;
  etapa: string;
  valor: string | null;
  createdAt: Date;
  updatedAt: Date;
  dataFechamento: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
};

type SegmentMetrics = {
  created: number;
  won: number;
  lost: number;
  revenue: number;
};

type SegmentBucket = {
  key: string;
  label: string;
  current: SegmentMetrics;
  previous: SegmentMetrics;
};

function emptyMetrics(): SegmentMetrics {
  return { created: 0, won: 0, lost: 0, revenue: 0 };
}

function closureDate(deal: DealRow) {
  return deal.dataFechamento ?? deal.wonAt ?? deal.lostAt ?? deal.updatedAt;
}

function inWindow(value: Date, start: Date, end: Date) {
  const time = value.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function sameDirection(change: number, anomaly: JarvisTemporalAnomaly) {
  return (change > 0 && anomaly.direction === "up") || (change < 0 && anomaly.direction === "down");
}

function confidence(sample: number, strength: number) {
  const sampleScore = Math.min(35, sample * 4);
  const strengthScore = Math.min(15, strength / 4);
  return Math.round(Math.max(50, Math.min(95, 45 + sampleScore + strengthScore)));
}

function normalizeCity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length >= 2 ? cleaned : null;
}

function leadCity(lead: { endereco: string | null; metadata: Record<string, unknown> | null }) {
  const metadata = lead.metadata ?? {};
  const direct = [metadata.cidade, metadata.city, metadata.municipio, metadata.localidade]
    .map(normalizeCity)
    .find(Boolean);
  if (direct) return direct;

  const address = normalizeCity(lead.endereco);
  if (!address) return null;
  const parts = address.split(",").map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2]?.replace(/\s*[-/]\s*[A-Z]{2}\b.*$/i, "").trim();
    return normalizeCity(candidate);
  }
  const stateMatch = address.match(/,\s*([^,]+?)\s*[-/]\s*[A-Z]{2}\b/i);
  return normalizeCity(stateMatch?.[1]);
}

function addDealToMetrics(metrics: SegmentMetrics, deal: DealRow, start: Date, end: Date) {
  if (inWindow(deal.createdAt, start, end)) metrics.created += 1;
  if (!WON_STAGES.has(deal.etapa) && !LOST_STAGES.has(deal.etapa)) return;
  if (!inWindow(closureDate(deal), start, end)) return;
  if (WON_STAGES.has(deal.etapa)) {
    metrics.won += 1;
    metrics.revenue += numberValue(deal.valor);
  } else {
    metrics.lost += 1;
  }
}

function conversion(metrics: SegmentMetrics) {
  const closed = metrics.won + metrics.lost;
  return closed ? metrics.won / closed : null;
}

function averageTicket(metrics: SegmentMetrics) {
  return metrics.won ? metrics.revenue / metrics.won : null;
}

function bucketFor(map: Map<string, SegmentBucket>, key: string, label: string) {
  const existing = map.get(key);
  if (existing) return existing;
  const created = { key, label, current: emptyMetrics(), previous: emptyMetrics() };
  map.set(key, created);
  return created;
}

function compareSegments(
  dimension: "seller" | "city",
  buckets: SegmentBucket[],
  anomalies: JarvisTemporalAnomaly[],
): JarvisAnomalyCorrelationFinding[] {
  const findings: JarvisAnomalyCorrelationFinding[] = [];

  for (const bucket of buckets) {
    for (const anomaly of anomalies) {
      if (anomaly.metric === "created_deals") {
        if (bucket.previous.created < 3) continue;
        const change = pctChange(bucket.current.created, bucket.previous.created);
        if (change == null || Math.abs(change) < 30 || !sameDirection(change, anomaly)) continue;
        findings.push({
          dimension,
          key: bucket.key,
          label: bucket.label,
          signal: "created_deals",
          direction: change > 0 ? "up" : "down",
          current: bucket.current.created,
          previous: bucket.previous.created,
          changePercent: Math.round(change * 10) / 10,
          changePoints: null,
          sampleSize: bucket.current.created + bucket.previous.created,
          confidence: confidence(bucket.previous.created, Math.abs(change)),
          relatedAnomalies: [anomaly.metric],
          evidence: dimension === "seller" ? "persisted_deal" : "persisted_lead",
          detail: `${bucket.label}: novos negócios ${change > 0 ? "subiram" : "caíram"} ${Math.abs(change).toFixed(1)}% no mesmo sentido da anomalia geral.`,
        });
        continue;
      }

      if (anomaly.metric === "won_revenue") {
        if (bucket.previous.won < 2 || bucket.previous.revenue <= 0) continue;
        const change = pctChange(bucket.current.revenue, bucket.previous.revenue);
        if (change == null || Math.abs(change) < 30 || !sameDirection(change, anomaly)) continue;
        findings.push({
          dimension,
          key: bucket.key,
          label: bucket.label,
          signal: "won_revenue",
          direction: change > 0 ? "up" : "down",
          current: bucket.current.revenue,
          previous: bucket.previous.revenue,
          changePercent: Math.round(change * 10) / 10,
          changePoints: null,
          sampleSize: bucket.current.won + bucket.previous.won,
          confidence: confidence(bucket.previous.won, Math.abs(change)),
          relatedAnomalies: [anomaly.metric],
          evidence: dimension === "seller" ? "persisted_deal" : "persisted_lead",
          detail: `${bucket.label}: receita ganha ${change > 0 ? "subiu" : "caiu"} ${Math.abs(change).toFixed(1)}% no mesmo sentido da anomalia geral.`,
        });
        continue;
      }

      if (anomaly.metric === "average_ticket") {
        const current = averageTicket(bucket.current);
        const previous = averageTicket(bucket.previous);
        if (current == null || previous == null || bucket.current.won < 2 || bucket.previous.won < 2) continue;
        const change = pctChange(current, previous);
        if (change == null || Math.abs(change) < 25 || !sameDirection(change, anomaly)) continue;
        findings.push({
          dimension,
          key: bucket.key,
          label: bucket.label,
          signal: "average_ticket",
          direction: change > 0 ? "up" : "down",
          current,
          previous,
          changePercent: Math.round(change * 10) / 10,
          changePoints: null,
          sampleSize: bucket.current.won + bucket.previous.won,
          confidence: confidence(Math.min(bucket.current.won, bucket.previous.won), Math.abs(change)),
          relatedAnomalies: [anomaly.metric],
          evidence: dimension === "seller" ? "persisted_deal" : "persisted_lead",
          detail: `${bucket.label}: ticket médio ${change > 0 ? "subiu" : "caiu"} ${Math.abs(change).toFixed(1)}% no mesmo sentido da anomalia geral.`,
        });
        continue;
      }

      const current = conversion(bucket.current);
      const previous = conversion(bucket.previous);
      const currentClosed = bucket.current.won + bucket.current.lost;
      const previousClosed = bucket.previous.won + bucket.previous.lost;
      if (current == null || previous == null || currentClosed < 3 || previousClosed < 3) continue;
      const points = (current - previous) * 100;
      if (Math.abs(points) < 10 || !sameDirection(points, anomaly)) continue;
      findings.push({
        dimension,
        key: bucket.key,
        label: bucket.label,
        signal: "conversion",
        direction: points > 0 ? "up" : "down",
        current,
        previous,
        changePercent: null,
        changePoints: Math.round(points * 10) / 10,
        sampleSize: currentClosed + previousClosed,
        confidence: confidence(Math.min(currentClosed, previousClosed), Math.abs(points) * 2),
        relatedAnomalies: [anomaly.metric],
        evidence: dimension === "seller" ? "persisted_deal" : "persisted_lead",
        detail: `${bucket.label}: conversão ${points > 0 ? "subiu" : "caiu"} ${Math.abs(points).toFixed(1)} p.p. no mesmo sentido da anomalia geral.`,
      });
    }
  }

  return findings;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export async function loadJarvisAnomalyCorrelationIntelligence(
  tenantId: string,
  temporalInput?: JarvisTemporalIntelligence,
): Promise<JarvisAnomalyCorrelationIntelligence> {
  const temporal = temporalInput ?? await loadJarvisTemporalIntelligence(tenantId);
  if (!temporal.anomalies.length) {
    return {
      tenantId,
      temporalAnomalies: 0,
      findings: [],
      coverage: { deals: temporal.coverage.dealsConsidered, leads: 0, sellers: 0, acceptedProposals: 0, discountApprovals: 0 },
    };
  }

  const previousStart = temporal.previousWindow.start;
  const currentStart = temporal.currentWindow.start;
  const currentEnd = temporal.currentWindow.end;
  const previousEnd = temporal.previousWindow.end;

  const deals = await db
    .select({
      id: dealsTable.id,
      leadId: dealsTable.leadId,
      assignedTo: dealsTable.assignedTo,
      etapa: dealsTable.etapa,
      valor: canonicalDealValueSql,
      createdAt: dealsTable.createdAt,
      updatedAt: dealsTable.updatedAt,
      dataFechamento: dealsTable.dataFechamento,
      wonAt: dealsTable.wonAt,
      lostAt: dealsTable.lostAt,
    })
    .from(dealsTable)
    .where(and(
      eq(dealsTable.tenantId, tenantId),
      or(
        gte(dealsTable.createdAt, previousStart),
        gte(dealsTable.updatedAt, previousStart),
        gte(dealsTable.dataFechamento, previousStart),
        gte(dealsTable.wonAt, previousStart),
        gte(dealsTable.lostAt, previousStart),
      ),
    ));

  const leadIds = [...new Set(deals.map((deal) => deal.leadId).filter((id): id is string => Boolean(id)))];
  const [leads, users, acceptedProposals, discountTasks] = await Promise.all([
    leadIds.length
      ? db.select({ id: leadsTable.id, endereco: leadsTable.endereco, metadata: leadsTable.metadata })
          .from(leadsTable)
          .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.id, leadIds)))
      : Promise.resolve([]),
    db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId)),
    db.select({
      id: propostasTable.id,
      itens: propostasTable.itens,
      acceptedAt: propostasTable.acceptedAt,
    })
      .from(propostasTable)
      .where(and(
        eq(propostasTable.tenantId, tenantId),
        eq(propostasTable.status, "aceita"),
        gte(propostasTable.acceptedAt, previousStart),
      )),
    db.select({
      id: agentTasksTable.id,
      payload: agentTasksTable.payload,
      createdAt: agentTasksTable.createdAt,
    })
      .from(agentTasksTable)
      .where(and(
        eq(agentTasksTable.tenantId, tenantId),
        eq(agentTasksTable.actionType, "aprovacao_desconto"),
        gte(agentTasksTable.createdAt, previousStart),
      )),
  ]);

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const userById = new Map(users.map((user) => [user.id, user.name]));
  const sellerBuckets = new Map<string, SegmentBucket>();
  const cityBuckets = new Map<string, SegmentBucket>();

  for (const deal of deals as DealRow[]) {
    const sellerKey = deal.assignedTo ?? "__unassigned";
    const sellerLabel = deal.assignedTo ? (userById.get(deal.assignedTo) ?? `Usuário ${deal.assignedTo}`) : "Sem responsável";
    const seller = bucketFor(sellerBuckets, sellerKey, sellerLabel);
    addDealToMetrics(seller.current, deal, currentStart, currentEnd);
    addDealToMetrics(seller.previous, deal, previousStart, previousEnd);

    const lead = deal.leadId ? leadById.get(deal.leadId) : undefined;
    const city = lead ? leadCity(lead) : null;
    if (city) {
      const cityBucket = bucketFor(cityBuckets, slug(city), city);
      addDealToMetrics(cityBucket.current, deal, currentStart, currentEnd);
      addDealToMetrics(cityBucket.previous, deal, previousStart, previousEnd);
    }
  }

  const findings: JarvisAnomalyCorrelationFinding[] = [
    ...compareSegments("seller", [...sellerBuckets.values()], temporal.anomalies),
    ...compareSegments("city", [...cityBuckets.values()], temporal.anomalies),
  ];

  const productBuckets = new Map<string, {
    label: string;
    currentRevenue: number;
    previousRevenue: number;
    currentProposals: Set<string>;
    previousProposals: Set<string>;
  }>();

  for (const proposal of acceptedProposals) {
    if (!proposal.acceptedAt) continue;
    const period = inWindow(proposal.acceptedAt, currentStart, currentEnd)
      ? "current"
      : inWindow(proposal.acceptedAt, previousStart, previousEnd)
        ? "previous"
        : null;
    if (!period) continue;

    for (const item of proposal.itens ?? []) {
      const label = String(item.nome || "Produto sem nome").trim();
      const key = String(item.produtoId || item.sku || slug(label));
      const bucket = productBuckets.get(key) ?? {
        label,
        currentRevenue: 0,
        previousRevenue: 0,
        currentProposals: new Set<string>(),
        previousProposals: new Set<string>(),
      };
      const revenue = numberValue(item.quantidade) * numberValue(item.valorUnitario);
      if (period === "current") {
        bucket.currentRevenue += revenue;
        bucket.currentProposals.add(proposal.id);
      } else {
        bucket.previousRevenue += revenue;
        bucket.previousProposals.add(proposal.id);
      }
      productBuckets.set(key, bucket);
    }
  }

  const revenueLikeAnomalies = temporal.anomalies.filter((item) => item.metric === "won_revenue" || item.metric === "average_ticket");
  for (const [key, product] of productBuckets.entries()) {
    if (product.previousProposals.size < 2 || product.previousRevenue <= 0) continue;
    const change = pctChange(product.currentRevenue, product.previousRevenue);
    if (change == null || Math.abs(change) < 30) continue;
    const related = revenueLikeAnomalies.filter((anomaly) => sameDirection(change, anomaly));
    if (!related.length) continue;
    findings.push({
      dimension: "product",
      key,
      label: product.label,
      signal: "accepted_product_revenue",
      direction: change > 0 ? "up" : "down",
      current: product.currentRevenue,
      previous: product.previousRevenue,
      changePercent: Math.round(change * 10) / 10,
      changePoints: null,
      sampleSize: product.currentProposals.size + product.previousProposals.size,
      confidence: confidence(product.previousProposals.size, Math.abs(change)),
      relatedAnomalies: related.map((item) => item.metric),
      evidence: "accepted_proposal_items",
      detail: `${product.label}: receita dos itens em propostas aceitas ${change > 0 ? "subiu" : "caiu"} ${Math.abs(change).toFixed(1)}%, acompanhando a direção da anomalia comercial. É um indicador de mix/produto, não prova de causa.`,
    });
  }

  const currentDiscounts: number[] = [];
  const previousDiscounts: number[] = [];
  for (const task of discountTasks) {
    const value = Number(task.payload?.discountPercent);
    if (!Number.isFinite(value)) continue;
    if (inWindow(task.createdAt, currentStart, currentEnd)) currentDiscounts.push(value);
    if (inWindow(task.createdAt, previousStart, previousEnd)) previousDiscounts.push(value);
  }

  if (currentDiscounts.length >= 3 && previousDiscounts.length >= 3) {
    const currentAvg = currentDiscounts.reduce((sum, value) => sum + value, 0) / currentDiscounts.length;
    const previousAvg = previousDiscounts.reduce((sum, value) => sum + value, 0) / previousDiscounts.length;
    const points = currentAvg - previousAvg;
    if (Math.abs(points) >= 2.5) {
      findings.push({
        dimension: "discount",
        key: "average-approved-discount",
        label: "Desconto médio aprovado",
        signal: "average_approved_discount",
        direction: points > 0 ? "up" : "down",
        current: currentAvg,
        previous: previousAvg,
        changePercent: null,
        changePoints: Math.round(points * 10) / 10,
        sampleSize: currentDiscounts.length + previousDiscounts.length,
        confidence: confidence(Math.min(currentDiscounts.length, previousDiscounts.length), Math.abs(points) * 8),
        relatedAnomalies: temporal.anomalies.map((item) => item.metric),
        evidence: "approved_discount_task",
        detail: `O desconto médio aprovado ${points > 0 ? "subiu" : "caiu"} ${Math.abs(points).toFixed(1)} p.p. entre os períodos. Trate como variável coincidente a investigar, não como causa automática das anomalias.`,
      });
    }
  }

  findings.sort((a, b) => b.confidence - a.confidence || b.sampleSize - a.sampleSize);

  return {
    tenantId,
    temporalAnomalies: temporal.anomalies.length,
    findings: findings.slice(0, 12),
    coverage: {
      deals: deals.length,
      leads: leads.length,
      sellers: sellerBuckets.size,
      acceptedProposals: acceptedProposals.length,
      discountApprovals: discountTasks.length,
    },
  };
}
