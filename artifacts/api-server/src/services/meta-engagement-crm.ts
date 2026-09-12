import { and, eq, sql } from "drizzle-orm";
import {
  conversationsTable,
  db,
  dealsTable,
  leadEventsTable,
  leadsTable,
  messagesTable,
} from "@workspace/db";

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

  return {
    duplicate: false,
    leadId: lead.id,
    leadCreated: created,
    dealId,
    scoreBoost,
    hotIntent: scoreBoost >= 15,
    ...conversation,
    attribution: {
      source: input.eventType === "comment" ? "instagram_comment" : "instagram",
      mediaId: input.mediaId ?? null,
      campaignId: input.campaignId ?? null,
    },
  } as const;
}
