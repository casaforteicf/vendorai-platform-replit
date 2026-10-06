import { and, eq } from "drizzle-orm";
import { contentCalendarItemsTable, db, mediaPlansTable } from "@workspace/db";

export type ValidatedMediaPlanContext = {
  mediaPlanId: string;
  campaignId: string;
  calendarItemId: string;
  campaign: {
    id: string;
    nome: string;
    objetivo: string;
    produtoServico: string;
    publico: string;
    oferta: string;
    mensagemCentral: string;
  };
};

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed || null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export async function validateMediaPlanGenerationContext(
  tenantId: string,
  headers: HeaderBag,
): Promise<ValidatedMediaPlanContext | null> {
  const mediaPlanId = headerValue(headers["x-vendorai-media-plan-id"]);
  const campaignId = headerValue(headers["x-vendorai-campaign-id"]);
  const calendarItemId = headerValue(headers["x-vendorai-calendar-item-id"]);
  const supplied = [mediaPlanId, campaignId, calendarItemId].filter(Boolean).length;

  if (supplied === 0) return null;
  if (supplied !== 3) {
    throw Object.assign(new Error("Contexto de Plano de Mídia incompleto."), { status: 422 });
  }

  const [[plan], [calendarItem]] = await Promise.all([
    db.select({ id: mediaPlansTable.id, tenantId: mediaPlansTable.tenantId, conteudo: mediaPlansTable.conteudo })
      .from(mediaPlansTable)
      .where(and(eq(mediaPlansTable.id, mediaPlanId!), eq(mediaPlansTable.tenantId, tenantId)))
      .limit(1),
    db.select({
      id: contentCalendarItemsTable.id,
      tenantId: contentCalendarItemsTable.tenantId,
      mediaPlanId: contentCalendarItemsTable.mediaPlanId,
      pilar: contentCalendarItemsTable.pilar,
    })
      .from(contentCalendarItemsTable)
      .where(and(eq(contentCalendarItemsTable.id, calendarItemId!), eq(contentCalendarItemsTable.tenantId, tenantId)))
      .limit(1),
  ]);

  if (!plan) throw Object.assign(new Error("Plano de Mídia não pertence ao tenant atual."), { status: 422 });
  if (!calendarItem || calendarItem.mediaPlanId !== mediaPlanId) {
    throw Object.assign(new Error("Ação do calendário não pertence ao Plano de Mídia informado."), { status: 422 });
  }

  const campaign = plan.conteudo.campanhas?.find((item) => item.id === campaignId);
  if (!campaign) {
    throw Object.assign(new Error("Campanha não pertence ao Plano de Mídia informado."), { status: 422 });
  }

  const plannedCampaignName = normalize(calendarItem.pilar.split(" · ")[0] || "");
  if (!plannedCampaignName || plannedCampaignName !== normalize(campaign.nome)) {
    throw Object.assign(new Error("Campanha informada não corresponde à ação atual do calendário."), { status: 422 });
  }

  return { mediaPlanId: mediaPlanId!, campaignId: campaignId!, calendarItemId: calendarItemId!, campaign };
}
