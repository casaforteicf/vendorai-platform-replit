import cron from "node-cron";
import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import {
  agentConfigsTable,
  agentTasksTable,
  campaignSentLogsTable,
  campaignsTable,
  db,
  dealsTable,
  type SegmentoFiltro,
} from "@workspace/db";
import type { Logger } from "pino";
import {
  hasCommercialAudienceFilter,
  resolveCampaignAudienceLeadIds,
} from "../services/campaignAudience.js";

type CampaignJourneyPlan = {
  audienceTags?: string[];
  sdrActivationScore?: number;
  opportunityScore?: number;
  reentryAllowed?: boolean;
};

function journeyPlanForCampaign(campaign: { contexto: unknown }): CampaignJourneyPlan | null {
  const ctx = campaign.contexto && typeof campaign.contexto === "object" && !Array.isArray(campaign.contexto)
    ? campaign.contexto as Record<string, unknown>
    : {};
  const direct = ctx["journeyPlan"];
  const marketing = ctx["marketingContext"] && typeof ctx["marketingContext"] === "object"
    ? ctx["marketingContext"] as Record<string, unknown>
    : {};
  const nested = marketing["journeyPlan"];
  const raw = direct && typeof direct === "object" ? direct : nested && typeof nested === "object" ? nested : null;
  return raw as CampaignJourneyPlan | null;
}

function effectiveFilter(campaign: { segmentoFiltro: SegmentoFiltro; contexto: unknown }): SegmentoFiltro {
  const current = campaign.segmentoFiltro ?? {};
  const plan = journeyPlanForCampaign(campaign);
  if (!plan) return current;
  return {
    ...current,
    audienceTags: current.audienceTags?.length ? current.audienceTags : plan.audienceTags,
    behaviorIntentMin: current.behaviorIntentMin ?? plan.sdrActivationScore,
  };
}

function isCommercialCampaign(campaign: { segmentoFiltro: SegmentoFiltro; contexto: unknown }) {
  const filtro = effectiveFilter(campaign);
  return hasCommercialAudienceFilter(filtro);
}

async function dispatchOneCampaign(campaign: any, log: Logger) {
  const filtro = effectiveFilter(campaign);

  await db
    .update(campaignsTable)
    .set({ status: "enviando", updatedAt: new Date() })
    .where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.status, "agendada")));

  try {
    const [agentConfig] = await db
      .select({ autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, campaign.tenantId))
      .limit(1);
    const isAutonomous = Boolean(agentConfig?.autonomyEnabledAt);

    let leadIds = await resolveCampaignAudienceLeadIds(campaign.tenantId, filtro, 500);

    // Nunca envia a mesma campanha duas vezes ao mesmo lead em caso de retry.
    if (leadIds.length) {
      const alreadySent = await db
        .select({ leadId: campaignSentLogsTable.leadId })
        .from(campaignSentLogsTable)
        .where(and(
          eq(campaignSentLogsTable.campaignId, campaign.id),
          inArray(campaignSentLogsTable.leadId, leadIds),
        ));
      const sent = new Set(alreadySent.map((row) => row.leadId));
      leadIds = leadIds.filter((id) => !sent.has(id));
    }

    if (!leadIds.length) {
      await db
        .update(campaignsTable)
        .set({ status: "concluida", totalDestinatarios: 0, totalEnviados: 0, updatedAt: new Date() })
        .where(eq(campaignsTable.id, campaign.id));
      log.info({ campaignId: campaign.id }, "commercial-campaigns: sem leads elegíveis");
      return;
    }

    const mensagensEtapa = campaign.mensagensEtapa as Record<string, string> | null | undefined;
    const dealStage = new Map<string, string>();
    if (mensagensEtapa && Object.keys(mensagensEtapa).length) {
      const rows = await db
        .select({ leadId: dealsTable.leadId, etapa: dealsTable.etapa, createdAt: dealsTable.createdAt })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, campaign.tenantId), inArray(dealsTable.leadId, leadIds)))
        .orderBy(desc(dealsTable.createdAt));
      for (const row of rows) if (row.leadId && !dealStage.has(row.leadId)) dealStage.set(row.leadId, row.etapa);
    }

    const isAb = Boolean(campaign.abTestEnabled && campaign.variantAText && campaign.variantBText);
    const half = Math.floor(leadIds.length / 2);
    const now = new Date();
    let enviados = 0;

    for (let index = 0; index < leadIds.length; index++) {
      const leadId = leadIds[index]!;
      try {
        const variant: "A" | "B" | "main" = isAb ? (index < half ? "A" : "B") : "main";
        const stage = dealStage.get(leadId);
        const message = isAb
          ? variant === "A" ? campaign.variantAText : campaign.variantBText
          : (stage && mensagensEtapa?.[stage]) || campaign.mensagem;
        const imageObjectPath = campaign.imageUrl
          ? String(campaign.imageUrl).replace(/^\/api\/storage\/objects/, "/objects")
          : undefined;

        const [task] = await db
          .insert(agentTasksTable)
          .values({
            tenantId: campaign.tenantId,
            leadId,
            agentName: "sdr",
            actionType: "enviar_whatsapp",
            payload: {
              leadId,
              conteudo: String(message),
              agentName: "sdr",
              canal: "whatsapp",
              campaignId: campaign.id,
              abVariant: variant,
              commercialAudience: true,
              ...(imageObjectPath ? { campaignImageObjectPath: imageObjectPath } : {}),
            },
            status: isAutonomous ? "executando" : "pendente_aprovacao",
            ...(isAutonomous ? { executedAt: now } : {}),
          })
          .returning();

        await db.insert(campaignSentLogsTable).values({
          id: crypto.randomUUID(),
          campaignId: campaign.id,
          leadId,
          variant,
          sentAt: now,
        });

        if (isAutonomous) {
          const { executeTaskAction } = await import("../routes/agent_tasks.js");
          await executeTaskAction(task, log);
          await new Promise<void>((resolve) => setTimeout(resolve, 4_000 + Math.floor(Math.random() * 5_000)));
        }
        enviados++;
      } catch (error) {
        log.error({ error, campaignId: campaign.id, leadId }, "commercial-campaigns: falha no lead");
      }
    }

    await db
      .update(campaignsTable)
      .set({
        status: "concluida",
        totalDestinatarios: leadIds.length,
        totalEnviados: enviados,
        updatedAt: new Date(),
      })
      .where(eq(campaignsTable.id, campaign.id));

    log.info({ campaignId: campaign.id, destinatarios: leadIds.length, enviados }, "commercial-campaigns: campanha concluída");
  } catch (error) {
    await db
      .update(campaignsTable)
      .set({ status: "agendada", updatedAt: new Date() })
      .where(eq(campaignsTable.id, campaign.id))
      .catch(() => {});
    throw error;
  }
}

export async function runCommercialCampaignDispatch(log: Logger) {
  const now = new Date();
  const due = await db
    .select()
    .from(campaignsTable)
    .where(and(
      eq(campaignsTable.status, "agendada"),
      isNotNull(campaignsTable.agendadaPara),
      lte(campaignsTable.agendadaPara, now),
    ));

  const campaigns = due.filter((campaign) => isCommercialCampaign(campaign));
  if (!campaigns.length) return;

  log.info({ count: campaigns.length }, "commercial-campaigns: campanhas comportamentais vencidas");
  for (const campaign of campaigns) {
    try {
      await dispatchOneCampaign(campaign, log);
    } catch (error) {
      log.error({ error, campaignId: campaign.id }, "commercial-campaigns: campanha falhou");
    }
  }
}

export function startCommercialCampaignScheduler(log: Logger) {
  // Roda um minuto antes do scheduler legado. Assim campanhas com leadIds ou
  // filtros comportamentais são concluídas aqui e não caem no fallback "todos".
  cron.schedule("14 * * * *", () => {
    void runCommercialCampaignDispatch(log);
  });
}
