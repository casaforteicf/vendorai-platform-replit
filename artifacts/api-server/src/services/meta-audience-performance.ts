import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type MetaAudiencePerformanceRow = {
  key: string;
  label: string;
  campaigns: number;
  activeCampaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  opportunities: number;
  sales: number;
  revenue: number;
  costPerLead: number | null;
  costPerOpportunity: number | null;
  costPerSale: number | null;
  leadToSaleRate: number | null;
  roas: number | null;
  score: number;
  recommendation: string;
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(2)) : null;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

function performanceScore(input: { spend: number; leads: number; sales: number; revenue: number }) {
  if (input.spend <= 0) return input.leads > 0 ? 55 : 25;
  const roas = input.revenue / input.spend;
  const saleSignal = Math.min(35, input.sales * 12);
  const leadSignal = Math.min(20, input.leads * 2);
  const roasSignal = Math.min(45, roas * 12);
  return Math.max(0, Math.min(100, Math.round(saleSignal + leadSignal + roasSignal)));
}

function recommendation(row: Omit<MetaAudiencePerformanceRow, "score" | "recommendation">) {
  if (row.spend === 0 && row.leads === 0) return "Ainda sem mídia ou dados suficientes para comparar.";
  if (row.spend > 0 && row.leads === 0) return "Revisar criativo, oferta ou tamanho da audiência antes de investir mais.";
  if (row.leads >= 3 && row.sales === 0) return "A audiência gera leads, mas ainda não gera venda; revisar qualidade e follow-up.";
  if (row.roas !== null && row.roas >= 3 && row.sales >= 2) return "Audiência vencedora: candidata a receber mais verba, sempre dentro do limite aprovado.";
  if (row.roas !== null && row.roas >= 1.5) return "Bom sinal comercial; manter e ampliar gradualmente se o custo por venda continuar saudável.";
  if (row.sales > 0) return "Já converte em venda; otimizar criativo e atendimento para elevar ROAS.";
  return "Manter em aprendizado e comparar com as demais audiências antes de escalar.";
}

export async function getMetaAudiencePerformance(tenantId: string) {
  const result = await db.execute(sql`
    WITH campaign_audience AS (
      SELECT
        c.id AS campaign_id,
        c.status,
        c.segmentacao->'metaCustomAudiences'->-1->>'key' AS audience_key,
        c.segmentacao->'metaCustomAudiences'->-1->>'label' AS audience_label
      FROM ad_campaigns c
      WHERE c.tenant_id = ${tenantId}
        AND c.plataforma = 'meta'
        AND c.segmentacao->>'metaAudienceTargetingMode' = 'custom_audience'
        AND jsonb_array_length(coalesce(c.segmentacao->'metaCustomAudiences', '[]'::jsonb)) > 0
    ),
    platform AS (
      SELECT
        s.campaign_id,
        coalesce(sum(s.custo), 0)::numeric AS spend,
        coalesce(sum(s.impressoes), 0)::bigint AS impressions,
        coalesce(sum(s.cliques), 0)::bigint AS clicks
      FROM ad_performance_snapshots s
      GROUP BY s.campaign_id
    ),
    valid_leads AS (
      SELECT l.id, l.ad_campaign_id
      FROM leads l
      WHERE l.tenant_id = ${tenantId}
        AND l.excluido_em IS NULL
        AND l.nao_lead_tipo IS NULL
        AND l.ad_campaign_id IS NOT NULL
    ),
    lead_stats AS (
      SELECT ad_campaign_id AS campaign_id, count(*)::bigint AS leads
      FROM valid_leads
      GROUP BY ad_campaign_id
    ),
    deal_stats AS (
      SELECT
        vl.ad_campaign_id AS campaign_id,
        count(d.id)::bigint AS opportunities,
        count(d.id) FILTER (WHERE d.etapa = 'ganho')::bigint AS sales,
        coalesce(sum(d.valor) FILTER (WHERE d.etapa = 'ganho'), 0)::numeric AS revenue
      FROM valid_leads vl
      LEFT JOIN deals d ON d.lead_id = vl.id AND d.tenant_id = ${tenantId}
      GROUP BY vl.ad_campaign_id
    )
    SELECT
      ca.audience_key,
      max(coalesce(ca.audience_label, ca.audience_key)) AS audience_label,
      count(distinct ca.campaign_id)::bigint AS campaigns,
      count(distinct ca.campaign_id) FILTER (WHERE ca.status = 'ativo')::bigint AS active_campaigns,
      coalesce(sum(p.spend), 0)::numeric AS spend,
      coalesce(sum(p.impressions), 0)::bigint AS impressions,
      coalesce(sum(p.clicks), 0)::bigint AS clicks,
      coalesce(sum(ls.leads), 0)::bigint AS leads,
      coalesce(sum(ds.opportunities), 0)::bigint AS opportunities,
      coalesce(sum(ds.sales), 0)::bigint AS sales,
      coalesce(sum(ds.revenue), 0)::numeric AS revenue
    FROM campaign_audience ca
    LEFT JOIN platform p ON p.campaign_id = ca.campaign_id
    LEFT JOIN lead_stats ls ON ls.campaign_id = ca.campaign_id
    LEFT JOIN deal_stats ds ON ds.campaign_id = ca.campaign_id
    GROUP BY ca.audience_key
    ORDER BY revenue DESC, sales DESC, leads DESC, spend ASC
  `);

  const rows: MetaAudiencePerformanceRow[] = (result.rows ?? []).map((raw) => {
    const value = raw as Record<string, unknown>;
    const base = {
      key: String(value["audience_key"] ?? ""),
      label: String(value["audience_label"] ?? value["audience_key"] ?? "Audiência Meta"),
      campaigns: Number(value["campaigns"] ?? 0),
      activeCampaigns: Number(value["active_campaigns"] ?? 0),
      spend: Number(value["spend"] ?? 0),
      impressions: Number(value["impressions"] ?? 0),
      clicks: Number(value["clicks"] ?? 0),
      leads: Number(value["leads"] ?? 0),
      opportunities: Number(value["opportunities"] ?? 0),
      sales: Number(value["sales"] ?? 0),
      revenue: Number(value["revenue"] ?? 0),
    };
    const metrics = {
      ...base,
      costPerLead: ratio(base.spend, base.leads),
      costPerOpportunity: ratio(base.spend, base.opportunities),
      costPerSale: ratio(base.spend, base.sales),
      leadToSaleRate: percent(base.sales, base.leads),
      roas: ratio(base.revenue, base.spend),
    };
    return {
      ...metrics,
      score: performanceScore(base),
      recommendation: recommendation({ ...metrics, score: 0, recommendation: "" } as MetaAudiencePerformanceRow),
    };
  });

  const ranked = [...rows].sort((a, b) => b.score - a.score || (b.roas ?? -1) - (a.roas ?? -1));
  const winner = ranked.find((row) => row.sales > 0 || row.leads > 0) ?? null;

  return {
    rows,
    winner: winner ? { key: winner.key, label: winner.label, score: winner.score, roas: winner.roas } : null,
    generatedAt: new Date().toISOString(),
    attribution: "campaign_custom_audience",
  };
}
