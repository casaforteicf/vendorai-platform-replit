import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type MetaRemarketingAudience = {
  key: string;
  label: string;
  count: number;
  lookbackDays: number;
  intent: "engaged" | "warm" | "hot";
  recommendedAction: string;
};

type CountRow = {
  engaged_30d?: string | number;
  hot_30d?: string | number;
  dm_30d?: string | number;
  comments_30d?: string | number;
  mentions_30d?: string | number;
  campaign_30d?: string | number;
};

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getMetaRemarketingOverview(tenantId: string) {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (
        WHERE (discovery_data->'metaEngagement'->>'remarketingEligibleUntil')::timestamptz >= now()
      ) AS engaged_30d,
      count(*) FILTER (
        WHERE (discovery_data->'metaEngagement'->>'remarketingEligibleUntil')::timestamptz >= now()
          AND coalesce((discovery_data->'metaEngagement'->>'hotIntent')::boolean, false) = true
      ) AS hot_30d,
      count(*) FILTER (
        WHERE (discovery_data->'metaEngagement'->>'remarketingEligibleUntil')::timestamptz >= now()
          AND discovery_data->'metaEngagement'->>'lastEventType' = 'dm'
      ) AS dm_30d,
      count(*) FILTER (
        WHERE (discovery_data->'metaEngagement'->>'remarketingEligibleUntil')::timestamptz >= now()
          AND discovery_data->'metaEngagement'->>'lastEventType' = 'comment'
      ) AS comments_30d,
      count(*) FILTER (
        WHERE (discovery_data->'metaEngagement'->>'remarketingEligibleUntil')::timestamptz >= now()
          AND discovery_data->'metaEngagement'->>'lastEventType' = 'mention'
      ) AS mentions_30d,
      count(*) FILTER (
        WHERE (discovery_data->'metaEngagement'->>'remarketingEligibleUntil')::timestamptz >= now()
          AND nullif(discovery_data->'metaEngagement'->>'lastCampaignId', '') IS NOT NULL
      ) AS campaign_30d
    FROM leads
    WHERE tenant_id = ${tenantId}
      AND excluido_em IS NULL
      AND discovery_data ? 'metaEngagement'
  `);

  const row = (result.rows?.[0] ?? {}) as CountRow;
  const engaged = count(row.engaged_30d);
  const hot = count(row.hot_30d);
  const dm = count(row.dm_30d);
  const comments = count(row.comments_30d);
  const mentions = count(row.mentions_30d);
  const campaign = count(row.campaign_30d);
  const warm = Math.max(0, engaged - hot);

  const audiences: MetaRemarketingAudience[] = [
    {
      key: "meta_engaged_30d",
      label: "Engajados Meta · 30 dias",
      count: engaged,
      lookbackDays: 30,
      intent: "engaged",
      recommendedAction: "Reimpactar com prova, diferenciais e conteúdo de continuidade.",
    },
    {
      key: "meta_hot_intent_30d",
      label: "Alta intenção Meta · 30 dias",
      count: hot,
      lookbackDays: 30,
      intent: "hot",
      recommendedAction: "Priorizar oferta, demonstração, orçamento ou conversa comercial.",
    },
    {
      key: "instagram_dm_30d",
      label: "DMs do Instagram · 30 dias",
      count: dm,
      lookbackDays: 30,
      intent: "warm",
      recommendedAction: "Manter follow-up e anúncios de consideração enquanto a conversa estiver aberta.",
    },
    {
      key: "instagram_comments_30d",
      label: "Comentários do Instagram · 30 dias",
      count: comments,
      lookbackDays: 30,
      intent: "engaged",
      recommendedAction: "Reforçar o tema ou produto que originou o comentário.",
    },
  ];

  return {
    eligibleLeads30d: engaged,
    warmLeads30d: warm,
    hotLeads30d: hot,
    dmLeads30d: dm,
    commentLeads30d: comments,
    mentionLeads30d: mentions,
    campaignEngagedLeads30d: campaign,
    audiences,
    externalAudienceSync: {
      status: "not_synced",
      reason: "As audiências internas estão prontas; criação/sincronização de Custom Audience na Meta permanece separada e não ativa gasto automaticamente.",
    },
  };
}
