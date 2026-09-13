import { db, sql } from "@workspace/db";

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getInstagramStoryFunnel(tenantId: string) {
  const [totalsResult, topStoriesResult] = await Promise.all([
    db.execute(sql`
      WITH story_posts AS (
        SELECT
          instagram_media_id,
          theme,
          caption_ou_texto,
          published_at,
          COALESCE((metricas->>'reach')::numeric, 0) AS reach,
          COALESCE((metricas->>'views')::numeric, (metricas->>'plays')::numeric, 0) AS views,
          COALESCE((metricas->>'replies')::numeric, 0) AS replies,
          COALESCE((metricas->>'linkClicks')::numeric, 0) AS link_clicks
        FROM content_published_posts
        WHERE tenant_id = ${tenantId}
          AND lower(content_type) LIKE '%stor%'
          AND published_at >= now() - interval '30 days'
      ),
      attributed_events AS (
        SELECT e.media_id, e.lead_id, e.event_type
        FROM meta_engagement_events e
        INNER JOIN story_posts s ON s.instagram_media_id = e.media_id
        WHERE e.tenant_id = ${tenantId}
          AND e.created_at >= now() - interval '30 days'
      ),
      attributed_leads AS (
        SELECT DISTINCT lead_id
        FROM attributed_events
        WHERE lead_id IS NOT NULL
      ),
      deal_stats AS (
        SELECT
          COUNT(DISTINCT d.id) AS opportunities,
          COUNT(DISTINCT d.id) FILTER (WHERE d.etapa = 'ganho') AS sales,
          COALESCE(SUM(d.valor::numeric) FILTER (WHERE d.etapa = 'ganho'), 0) AS revenue
        FROM deals d
        INNER JOIN attributed_leads l ON l.lead_id = d.lead_id
        WHERE d.tenant_id = ${tenantId}
      )
      SELECT
        COUNT(*) AS stories,
        COALESCE(SUM(reach), 0) AS reach,
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(replies), 0) AS replies,
        COALESCE(SUM(link_clicks), 0) AS link_clicks,
        (SELECT COUNT(*) FROM attributed_events WHERE event_type = 'dm') AS dms,
        (SELECT COUNT(DISTINCT lead_id) FROM attributed_events WHERE lead_id IS NOT NULL) AS leads,
        COALESCE((SELECT opportunities FROM deal_stats), 0) AS opportunities,
        COALESCE((SELECT sales FROM deal_stats), 0) AS sales,
        COALESCE((SELECT revenue FROM deal_stats), 0) AS revenue
      FROM story_posts
    `),
    db.execute(sql`
      WITH story_posts AS (
        SELECT
          instagram_media_id,
          theme,
          caption_ou_texto,
          published_at,
          COALESCE((metricas->>'reach')::numeric, 0) AS reach,
          COALESCE((metricas->>'views')::numeric, (metricas->>'plays')::numeric, 0) AS views,
          COALESCE((metricas->>'replies')::numeric, 0) AS replies,
          COALESCE((metricas->>'linkClicks')::numeric, 0) AS link_clicks
        FROM content_published_posts
        WHERE tenant_id = ${tenantId}
          AND lower(content_type) LIKE '%stor%'
          AND published_at >= now() - interval '30 days'
      ),
      event_stats AS (
        SELECT
          s.instagram_media_id,
          COUNT(*) FILTER (WHERE e.event_type = 'dm') AS dms,
          COUNT(DISTINCT e.lead_id) FILTER (WHERE e.lead_id IS NOT NULL) AS leads
        FROM story_posts s
        LEFT JOIN meta_engagement_events e
          ON e.tenant_id = ${tenantId}
         AND e.media_id = s.instagram_media_id
         AND e.created_at >= now() - interval '30 days'
        GROUP BY s.instagram_media_id
      ),
      story_leads AS (
        SELECT DISTINCT e.media_id AS instagram_media_id, e.lead_id
        FROM meta_engagement_events e
        INNER JOIN story_posts s ON s.instagram_media_id = e.media_id
        WHERE e.tenant_id = ${tenantId}
          AND e.created_at >= now() - interval '30 days'
          AND e.lead_id IS NOT NULL
      ),
      story_deals AS (
        SELECT
          sl.instagram_media_id,
          COUNT(DISTINCT d.id) AS opportunities,
          COUNT(DISTINCT d.id) FILTER (WHERE d.etapa = 'ganho') AS sales,
          COALESCE(SUM(d.valor::numeric) FILTER (WHERE d.etapa = 'ganho'), 0) AS revenue
        FROM story_leads sl
        INNER JOIN deals d
          ON d.tenant_id = ${tenantId}
         AND d.lead_id = sl.lead_id
        GROUP BY sl.instagram_media_id
      )
      SELECT
        s.instagram_media_id,
        s.theme,
        s.caption_ou_texto,
        s.published_at,
        s.reach,
        s.views,
        s.replies,
        s.link_clicks,
        COALESCE(es.dms, 0) AS dms,
        COALESCE(es.leads, 0) AS leads,
        COALESCE(sd.opportunities, 0) AS opportunities,
        COALESCE(sd.sales, 0) AS sales,
        COALESCE(sd.revenue, 0) AS revenue
      FROM story_posts s
      LEFT JOIN event_stats es USING (instagram_media_id)
      LEFT JOIN story_deals sd USING (instagram_media_id)
      ORDER BY COALESCE(sd.sales, 0) DESC, COALESCE(es.leads, 0) DESC, (s.replies + s.link_clicks) DESC, s.views DESC
      LIMIT 5
    `),
  ]);

  const raw = totalsResult.rows?.[0] ?? {};
  const totals = {
    stories: num((raw as any).stories),
    reach: num((raw as any).reach),
    views: num((raw as any).views),
    replies: num((raw as any).replies),
    linkClicks: num((raw as any).link_clicks),
    dms: num((raw as any).dms),
    leads: num((raw as any).leads),
    opportunities: num((raw as any).opportunities),
    sales: num((raw as any).sales),
    revenue: num((raw as any).revenue),
  };

  const interactions = totals.replies + totals.linkClicks;
  return {
    periodDays: 30,
    attribution: "instagram_story_media_id",
    totals,
    rates: {
      interactionPerReach: totals.reach > 0 ? (interactions / totals.reach) * 100 : null,
      dmPerInteraction: interactions > 0 ? (totals.dms / interactions) * 100 : null,
      leadPerDm: totals.dms > 0 ? (totals.leads / totals.dms) * 100 : null,
      opportunityPerLead: totals.leads > 0 ? (totals.opportunities / totals.leads) * 100 : null,
      salePerOpportunity: totals.opportunities > 0 ? (totals.sales / totals.opportunities) * 100 : null,
    },
    topStories: (topStoriesResult.rows ?? []).map((row: any) => ({
      mediaId: row.instagram_media_id,
      theme: row.theme ?? null,
      caption: row.caption_ou_texto ?? null,
      publishedAt: row.published_at,
      reach: num(row.reach),
      views: num(row.views),
      replies: num(row.replies),
      linkClicks: num(row.link_clicks),
      dms: num(row.dms),
      leads: num(row.leads),
      opportunities: num(row.opportunities),
      sales: num(row.sales),
      revenue: num(row.revenue),
    })),
    generatedAt: new Date().toISOString(),
  };
}
