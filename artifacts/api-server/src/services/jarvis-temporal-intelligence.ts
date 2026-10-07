import { and, eq, gte, or } from "drizzle-orm";
import { db, dealsTable } from "@workspace/db";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_DAYS = 30;

const WON_STAGES = new Set(["ganho", "entregue"]);
const LOST_STAGES = new Set(["perdido", "cancelado"]);

type PeriodMetrics = {
  createdDeals: number;
  wonDeals: number;
  lostDeals: number;
  closedDeals: number;
  wonRevenueBrl: number;
  averageTicketBrl: number | null;
  conversionRate: number | null;
};

export type JarvisTemporalAnomaly = {
  metric: "created_deals" | "won_revenue" | "average_ticket" | "conversion";
  direction: "up" | "down";
  severity: "attention" | "strong";
  current: number;
  previous: number;
  changePercent: number | null;
  changePoints: number | null;
  confidence: number;
  detail: string;
};

export type JarvisTemporalIntelligence = {
  tenantId: string;
  currentWindow: { start: Date; end: Date; days: number };
  previousWindow: { start: Date; end: Date; days: number };
  current: PeriodMetrics;
  previous: PeriodMetrics;
  anomalies: JarvisTemporalAnomaly[];
  coverage: {
    dealsConsidered: number;
    currentClosed: number;
    previousClosed: number;
  };
};

function closureDate(deal: {
  dataFechamento: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  updatedAt: Date;
}) {
  return deal.dataFechamento ?? deal.wonAt ?? deal.lostAt ?? deal.updatedAt;
}

function inWindow(value: Date, start: Date, end: Date) {
  const time = value.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function numeric(value: string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFor(
  deals: Array<{
    etapa: string;
    valor: string | null;
    createdAt: Date;
    updatedAt: Date;
    dataFechamento: Date | null;
    wonAt: Date | null;
    lostAt: Date | null;
  }>,
  start: Date,
  end: Date,
): PeriodMetrics {
  const createdDeals = deals.filter((deal) => inWindow(deal.createdAt, start, end)).length;
  const closed = deals.filter((deal) => {
    if (!WON_STAGES.has(deal.etapa) && !LOST_STAGES.has(deal.etapa)) return false;
    return inWindow(closureDate(deal), start, end);
  });
  const won = closed.filter((deal) => WON_STAGES.has(deal.etapa));
  const lost = closed.filter((deal) => LOST_STAGES.has(deal.etapa));
  const wonRevenueBrl = won.reduce((sum, deal) => sum + numeric(deal.valor), 0);

  return {
    createdDeals,
    wonDeals: won.length,
    lostDeals: lost.length,
    closedDeals: closed.length,
    wonRevenueBrl,
    averageTicketBrl: won.length ? wonRevenueBrl / won.length : null,
    conversionRate: closed.length ? won.length / closed.length : null,
  };
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function confidence(sample: number) {
  return Math.max(45, Math.min(95, Math.round(45 + sample * 4)));
}

function pushPercentAnomaly(
  target: JarvisTemporalAnomaly[],
  metric: JarvisTemporalAnomaly["metric"],
  current: number,
  previous: number,
  minimumPreviousSample: number,
  actualPreviousSample: number,
  label: string,
) {
  if (actualPreviousSample < minimumPreviousSample || previous <= 0) return;
  const change = pctChange(current, previous);
  if (change == null || Math.abs(change) < 25) return;
  target.push({
    metric,
    direction: change > 0 ? "up" : "down",
    severity: Math.abs(change) >= 45 ? "strong" : "attention",
    current,
    previous,
    changePercent: Math.round(change * 10) / 10,
    changePoints: null,
    confidence: confidence(actualPreviousSample),
    detail: `${label}: período atual=${current.toFixed(2)}; período anterior=${previous.toFixed(2)}; variação=${change.toFixed(1)}%.`,
  });
}

export async function loadJarvisTemporalIntelligence(
  tenantId: string,
  now = new Date(),
): Promise<JarvisTemporalIntelligence> {
  const currentEnd = now;
  const currentStart = new Date(currentEnd.getTime() - CURRENT_DAYS * DAY_MS);
  const previousEnd = currentStart;
  const previousStart = new Date(previousEnd.getTime() - CURRENT_DAYS * DAY_MS);

  const deals = await db
    .select({
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

  const current = metricsFor(deals, currentStart, currentEnd);
  const previous = metricsFor(deals, previousStart, previousEnd);
  const anomalies: JarvisTemporalAnomaly[] = [];

  pushPercentAnomaly(
    anomalies,
    "created_deals",
    current.createdDeals,
    previous.createdDeals,
    5,
    previous.createdDeals,
    "Novos negócios",
  );
  pushPercentAnomaly(
    anomalies,
    "won_revenue",
    current.wonRevenueBrl,
    previous.wonRevenueBrl,
    3,
    previous.wonDeals,
    "Receita de negócios ganhos",
  );

  if (current.averageTicketBrl != null && previous.averageTicketBrl != null) {
    pushPercentAnomaly(
      anomalies,
      "average_ticket",
      current.averageTicketBrl,
      previous.averageTicketBrl,
      3,
      previous.wonDeals,
      "Ticket médio ganho",
    );
  }

  if (
    current.conversionRate != null &&
    previous.conversionRate != null &&
    current.closedDeals >= 5 &&
    previous.closedDeals >= 5
  ) {
    const points = (current.conversionRate - previous.conversionRate) * 100;
    if (Math.abs(points) >= 15) {
      anomalies.push({
        metric: "conversion",
        direction: points > 0 ? "up" : "down",
        severity: Math.abs(points) >= 25 ? "strong" : "attention",
        current: current.conversionRate,
        previous: previous.conversionRate,
        changePercent: null,
        changePoints: Math.round(points * 10) / 10,
        confidence: confidence(Math.min(current.closedDeals, previous.closedDeals)),
        detail: `Conversão de fechamentos: atual=${(current.conversionRate * 100).toFixed(1)}%; anterior=${(previous.conversionRate * 100).toFixed(1)}%; diferença=${points.toFixed(1)} p.p.`,
      });
    }
  }

  anomalies.sort((a, b) => b.confidence - a.confidence || (b.severity === "strong" ? 1 : -1));

  return {
    tenantId,
    currentWindow: { start: currentStart, end: currentEnd, days: CURRENT_DAYS },
    previousWindow: { start: previousStart, end: previousEnd, days: CURRENT_DAYS },
    current,
    previous,
    anomalies,
    coverage: {
      dealsConsidered: deals.length,
      currentClosed: current.closedDeals,
      previousClosed: previous.closedDeals,
    },
  };
}
