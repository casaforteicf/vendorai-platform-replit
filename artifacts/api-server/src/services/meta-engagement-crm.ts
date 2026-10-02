import { and, eq, sql } from "drizzle-orm";
import {
  conversationsTable,
  db,
  dealsTable,
  leadEventsTable,
  leadsTable,
  messagesTable,
} from "@workspace/db";
import { recordIntelligenceEvent, recordIntelligenceFact } from "./customer-intelligence-history.js";

export type MetaEngagementInput = {
  externalEventId: string;
  eventType: "dm" | "comment" | "mention";
  instagramScopedId: string;
  username?: string | null;
  text?: string | null;
  mediaId?: string | null;
  campaignId?: string | null;
  metadata?: Record<string, unknown>;
};

function intentScore(text: string | null | undefined) {
  const normalized = (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const strong = ["quero", "preco", "valor", "orcamento", "comprar", "contratar", "demo", "demonstracao", "teste"];
  const medium = ["interesse", "como funciona", "me chama", "chama no direct", "saiba mais"];
  if (strong.some((term) => normalized.includes(term))) return 30;
  if (medium.some((term) => normalized.includes(term))) return 15;
  return 5;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function eventAudienceTags(input: MetaEngagementInput, scoreBoost: number) {
  const tags = new Set<string>(["Meta engajados 30d", "Instagram engajados 30d"]);
  if (input.eventType === "dm") tags.add("Instagram DM 30d");
  if (input.eventType === "comment") tags.add("Instagram comentários 30d");
  if (input.eventType === "mention") tags.add("Instagram menções 30d");
  if (scoreBoost >= 15) tags.add("Meta alta intenção 30d");
  if (scoreBoost >= 30) tags.add("Meta intenção comercial forte 30d");
  if (input.campaignId) tags.add("Meta campanha engajada 30d");
  return Array.from(tags);
}

async function reserveEvent(tenantId: string, input: MetaEngagementInput) {
  const inserted = await db.execute(sql`
    INSERT INTO meta_engagement_events (
      tenant_id, external_event_id, event_type, instagram_scoped_id,
      username, text_content, media_id, campaign_id, metadata
    ) VALUES (
      ${tenantId}, ${input.externalEventId}, ${input.eventType}, ${input.instagramScopedId},
      ${input.username ?? null}, ${input.text ?? null}, ${input.mediaId ?? null}, ${input.campaignId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    ON CONFLICT (tenant_id, external_event_id) DO NOTHING
    RETURNING id
  `);
  return Array.isArray(inserted.rows) && inserted.rows.length > 0;
}

async function bindEventToLead(tenantId: string, externalEventId: string, leadId: string) {
  await db.execute(sql`
    UPDATE meta_engagement_events
       SET lead_id = ${leadId}
     WHERE tenant_id = ${tenantId}
       AND external_event_id = ${externalEventId}
  `);
}

async function findOrCreateLead(tenantId: string, input: MetaEngagementInput) {
  let [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, input.instagramScopedId)))
    .limit(1);

  let created = false;
  if (!lead) {
    [lead] = await db
      .insert(leadsTable)
      .values({
        tenantId,
        nome: input.username ? `@${input.username.replace(/^@/, "")}` : `Instagram @${input.instagramScopedId.slice(0, 8)}`,
        instagramScopedId: input.instagramScopedId,
        status: "novo",
        source: input.eventType === "comment" ? "instagram_comment" : "instagram",
        adCampaignId: input.campaignId ?? null,
      })
      .returning();
    created = true;
  } else {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (!lead.adCampaignId && input.campaignId) patch.adCampaignId = input.campaignId;
    await db.update(leadsTable).set(patch).where(eq(leadsTable.id, lead.id));
  }

  return { lead, created };
}

async function ensureOpportunity(tenantId: string, leadId: string, title: string) {
  const [existing] = await db
    .select({ id: dealsTable.id })
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, leadId)))
    .limit(1);
  if (existing) return existing.id;

  const [deal] = await db
    .insert(dealsTable)
    .values({ tenantId, leadId, titulo: title, etapa: "em_aquecimento" })
    .returning({ id: dealsTable.id });
  return deal.id;
}

async function recordConversation(tenantId: string, leadId: string, input: MetaEngagementInput) {
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.tenantId, tenantId),
      eq(conversationsTable.leadId, leadId),
      eq(conversationsTable.channel, "instagram"),
    ))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId, channel: "instagram", status: "open", naoLidas: 0 })
      .returning();
  }

  const prefix = input.eventType === "comment" ? "Comentário no Instagram" : input.eventType === "mention" ? "Menção no Instagram" : "Instagram DM";
  const conteudo = input.text?.trim() ? `${prefix}: ${input.text.trim()}` : prefix;
  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId,
      direcao: "entrada",
      canal: "instagram",
      conteudo,
      enviadoPor: "lead",
      tipoConteudo: "texto",
      status: "entregue",
    })
    .returning({ id: messagesTable.id });

  void recordIntelligenceEvent({
    tenantId,
    leadId,
    eventType: "message_received",
    title: input.eventType === "dm" ? "Mensagem recebida via Instagram" : prefix,
    summary: conteudo.slice(0, 500),
    sourceModule: "messages",
    sourceId: message.id,
    metadata: { canal: "instagram", eventType: input.eventType, campaignId: input.campaignId ?? null },
  });
  void recordIntelligenceFact({
    tenantId,
    leadId,
    kind: "declaracao_cliente",
    factKey: "ultima_interacao_cliente",
    value: { canal: "instagram", conteudo: conteudo.slice(0, 1000), em: new Date().toISOString(), eventType: input.eventType },
    sourceType: "mensagem",
    sourceModule: "messages",
    sourceId: message.id,
    title: prefix,
  });

  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      lastInboundAt: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  return { conversationId: conversation.id, messageId: message.id };
}

async function updateRemarketingJourney(
  tenantId: string,
  leadId: string,
  input: MetaEngagementInput,
  scoreBoost: number,
) {
  const [current] = await db
    .select({ discoveryData: leadsTable.discoveryData, proximaAcao: leadsTable.proximaAcao })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!current) return [] as string[];

  const discoveryData = asRecord(current.discoveryData);
  const existingJourney = asRecord(discoveryData["commercialJourney"]);
  const existingMeta = asRecord(discoveryData["metaEngagement"]);
  const nextTags = Array.from(new Set([
    ...stringArray(existingJourney["audienceTags"]),
    ...eventAudienceTags(input, scoreBoost),
  ]));
  const nowIso = new Date().toISOString();
  const nextAction = scoreBoost >= 30
    ? "Responder o engajamento Meta agora e manter o lead em audiência de alta intenção até conversão."
    : scoreBoost >= 15
      ? "Priorizar follow-up e manter em audiência Meta de alta intenção por 30 dias."
      : "Manter em audiência Meta de engajados por 30 dias e reavaliar quando houver novo sinal.";

  await db
    .update(leadsTable)
    .set({
      discoveryData: {
        ...discoveryData,
        commercialJourney: {
          ...existingJourney,
          stage: scoreBoost >= 15 ? "oportunidade" : existingJourney["stage"] ?? "remarketing",
          stageLabel: scoreBoost >= 15 ? "Oportunidade social" : existingJourney["stageLabel"] ?? "Remarketing",
          nextBestAction: nextAction,
          audienceTags: nextTags,
          lastSignalAt: nowIso,
        },
        metaEngagement: {
          ...existingMeta,
          lastEventType: input.eventType,
          lastEventAt: nowIso,
          lastMediaId: input.mediaId ?? existingMeta["lastMediaId"] ?? null,
          lastCampaignId: input.campaignId ?? existingMeta["lastCampaignId"] ?? null,
          lastScoreBoost: scoreBoost,
          hotIntent: scoreBoost >= 15,
          remarketingEligibleUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          audienceTags: nextTags.filter((tag) => tag.startsWith("Meta") || tag.startsWith("Instagram")),
        },
      },
      proximaAcao: current.proximaAcao?.trim() ? current.proximaAcao : nextAction,
      updatedAt: new Date(),
    })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  return nextTags;
}

export async function ingestMetaEngagement(tenantId: string, input: MetaEngagementInput) {
  const firstSeen = await reserveEvent(tenantId, input);
  if (!firstSeen) return { duplicate: true } as const;

  const { lead, created } = await findOrCreateLead(tenantId, input);
  await bindEventToLead(tenantId, input.externalEventId, lead.id);

  const scoreBoost = intentScore(input.text);
  const shouldCreateOpportunity = input.eventType === "dm" || scoreBoost >= 15;
  const dealId = shouldCreateOpportunity ? await ensureOpportunity(tenantId, lead.id, lead.nome) : null;

  const conversation = await recordConversation(tenantId, lead.id, input);
  await db.insert(leadEventsTable).values({
    leadId: lead.id,
    tipo: `meta_${input.eventType}`,
    descricao: `${input.eventType === "comment" ? "Comentário" : input.eventType === "mention" ? "Menção" : "DM"} recebido via Instagram${input.mediaId ? ` · mídia ${input.mediaId}` : ""}`,
    scoreBoost,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const audienceTags = await updateRemarketingJourney(tenantId, lead.id, input, scoreBoost);

  return {
    duplicate: false,
    leadId: lead.id,
    leadCreated: created,
    dealId,
    scoreBoost,
    hotIntent: scoreBoost >= 15,
    remarketingEligible: true,
    audienceTags,
    ...conversation,
    attribution: {
      source: input.eventType === "comment" ? "instagram_comment" : "instagram",
      mediaId: input.mediaId ?? null,
      campaignId: input.campaignId ?? null,
    },
  } as const;
}
