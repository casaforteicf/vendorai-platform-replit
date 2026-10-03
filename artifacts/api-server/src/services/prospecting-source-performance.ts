import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function getProspectingSourcePerformance(tenantId: string, days = 90) {
  const periodDays = Math.min(Math.max(Number(days || 90), 7), 365);
  const result = await db.execute<{
    source: string;
    leads: number | string;
    qualified: number | string;
    proposals: number | string;
    wins: number | string;
    won_value: string | null;
  }>(sql`
    WITH lead_sources AS (
      SELECT
        l.id AS lead_id,
        l.tenant_id,
        l.created_at,
        source_name
      FROM leads l
      CROSS JOIN LATERAL (
        SELECT DISTINCT source_name
        FROM (
          SELECT NULLIF(l.source, '') AS source_name
          UNION ALL
          SELECT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(l.metadata->'prospector_fontes') = 'array'
              THEN l.metadata->'prospector_fontes'
              ELSE '[]'::jsonb
            END
          )
        ) src
        WHERE source_name IS NOT NULL
      ) sources
      WHERE l.tenant_id = ${tenantId}
        AND l.excluido_em IS NULL
        AND l.nao_lead_tipo IS NULL
        AND l.created_at >= now() - make_interval(days => ${periodDays})
    ),
    deal_rollup AS (
      SELECT
        lead_id,
        bool_or(etapa IN ('qualificado','proposta','negociacao','ganho','em_execucao','entregue')) AS qualified,
        bool_or(etapa IN ('proposta','negociacao','ganho','em_execucao','entregue')) AS proposal,
        bool_or(etapa IN ('ganho','em_execucao','entregue')) AS won,
        max(CASE WHEN etapa IN ('ganho','em_execucao','entregue') THEN valor ELSE NULL END) AS won_value
      FROM deals
      WHERE tenant_id = ${tenantId}
      GROUP BY lead_id
    )
    SELECT
      ls.source_name AS source,
      count(DISTINCT ls.lead_id)::int AS leads,
      count(DISTINCT ls.lead_id) FILTER (WHERE coalesce(dr.qualified, false))::int AS qualified,
      count(DISTINCT ls.lead_id) FILTER (WHERE coalesce(dr.proposal, false))::int AS proposals,
      count(DISTINCT ls.lead_id) FILTER (WHERE coalesce(dr.won, false))::int AS wins,
      coalesce(sum(dr.won_value), 0)::text AS won_value
    FROM lead_sources ls
    LEFT JOIN deal_rollup dr ON dr.lead_id = ls.lead_id
    GROUP BY ls.source_name
    ORDER BY wins DESC, proposals DESC, leads DESC
  `);

  return result.rows.map((row) => {
    const leads = Number(row.leads ?? 0);
    const wins = Number(row.wins ?? 0);
    return {
      source: row.source,
      leads,
      qualified: Number(row.qualified ?? 0),
      proposals: Number(row.proposals ?? 0),
      wins,
      wonValue: Number(row.won_value ?? 0),
      leadToWinRate: leads > 0 ? Number(((wins / leads) * 100).toFixed(1)) : 0,
    };
  });
}
