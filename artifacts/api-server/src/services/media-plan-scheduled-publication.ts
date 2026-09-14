import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  contentCalendarItemsTable,
  contentGenerationsTable,
  db,
  mediaPlansTable,
  socialPublicationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { createFacebookOrganicPublication } from "./facebook-organic-publication.js";
import { createInstagramOrganicPublication } from "./instagram-organic-publication.js";
import { createSocialPublication } from "./social-platforms.js";

const DEFAULT_TIMEZONE = process.env["MARKETING_SCHEDULE_TIMEZONE"] || "America/Sao_Paulo";
const DEFAULT_PUBLISH_TIME = process.env["MARKETING_DEFAULT_PUBLISH_TIME"] || "10:00";
const MAX_DUE_ITEMS_PER_TICK = 50;

const AUTO_TYPES = ["feed", "stories", "reels", "carrossel", "linkedin_post", "tiktok", "youtube_short", "youtube_video"] as const;
const AUTO_TYPE_SET = new Set<string>(AUTO_TYPES);

type OrganicPublicationSettings = {
  modo?: "manual" | "automatico";
  horario?: string;
  timezone?: string;
};

type GenerationVariation = Record<string, unknown>;
type AutoProvider = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function validTime(value: unknown): string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : DEFAULT_PUBLISH_TIME;
}

function validTimezone(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function localMinuteKey(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}`;
}

function isDue(date: string, itemTime: string | null, settings: OrganicPublicationSettings, now = new Date()) {
  const timezone = validTimezone(settings.timezone);
  const time = validTime(itemTime || settings.horario);
  return {
    due: localMinuteKey(timezone, now) >= `${date}T${time}`,
    timezone,
    time,
  };
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))));
}

function variationData(result: unknown, variationIdx: number | null): { text: string; mediaUrls: string[]; videoUrls: string[] } {
  const payload = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
  const variations = Array.isArray(payload.variations) ? payload.variations : [];
  const raw = variations[variationIdx ?? 0] ?? variations[0];
  const value: GenerationVariation = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as GenerationVariation : {};
  const videoUrls = uniqueStrings([
    ...(Array.isArray(value.videoUrls) ? value.videoUrls : []),
    value.videoUrl,
  ]);
  const mediaUrls = uniqueStrings([
    ...(Array.isArray(value.imageUrls) ? value.imageUrls : []),
    value.imageUrl,
    ...(Array.isArray(value.mediaUrls) ? value.mediaUrls : []),
    ...videoUrls,
  ]);
  const hashtags = Array.isArray(value.hashtags) ? uniqueStrings(value.hashtags).join(" ") : "";
  const text = uniqueStrings([value.hook, value.caption, value.text, value.cta, hashtags]).join("\n\n");
  return { text, mediaUrls, videoUrls };
}

function providerFor(item: { canal: string; tipo: string }): AutoProvider | null {
  const channel = normalize(item.canal);
  if (item.tipo === "tiktok" || channel.includes("tiktok")) return "tiktok";
  if (item.tipo === "youtube_short" || item.tipo === "youtube_video" || channel.includes("youtube")) return "youtube";
  if (item.tipo === "linkedin_post" || channel.includes("linkedin")) return "linkedin";
  if (channel.includes("facebook")) return "facebook";
  if (channel.includes("instagram")) return "instagram";
  return null;
}

async function existingPublicationForCalendarItem(tenantId: string, calendarItemId: string) {
  const [existing] = await db.select({ id: socialPublicationsTable.id }).from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.tenantId, tenantId),
    sql`${socialPublicationsTable.metadata}->>'calendarItemId' = ${calendarItemId}`,
  )).limit(1);
  return existing ?? null;
}

async function createScheduledPublication(input: {
  tenantId: string;
  item: {
    id: string;
    canal: string;
    tipo: string;
    temaSugerido: string;
    dataAgendada: string;
    horarioAgendado: string | null;
    contentGenerationId: string;
    variationIdx: number | null;
  };
  generationResult: unknown;
  timezone: string;
  time: string;
}) {
  const { tenantId, item } = input;
  const provider = providerFor(item);
  if (!provider || !AUTO_TYPE_SET.has(item.tipo)) return null;

  const preview = variationData(input.generationResult, item.variationIdx);
  const text = preview.text || item.temaSugerido;
  const isReel = item.tipo === "reels";
  const isStory = item.tipo === "stories";
  const isVideoOnlyProvider = provider === "tiktok" || provider === "youtube";
  const primaryVideo = preview.videoUrls[0];
  const primaryMedia = primaryVideo || preview.mediaUrls[0];

  if ((provider === "instagram" || provider === "facebook") && !primaryMedia) {
    throw new Error("scheduled_publication_missing_media");
  }
  if ((isReel || isVideoOnlyProvider) && !primaryVideo) {
    throw new Error(isVideoOnlyProvider ? "scheduled_video_missing_final_media" : "scheduled_reel_missing_video");
  }

  let publication;
  if (provider === "instagram") {
    publication = await createInstagramOrganicPublication(tenantId, {
      text,
      mediaUrl: isReel ? primaryVideo : preview.mediaUrls[0],
      mediaUrls: item.tipo === "carrossel" ? preview.mediaUrls : undefined,
      contentType: isReel ? "reel" : isStory ? "story" : item.tipo === "carrossel" ? "carousel" : "image",
    });
  } else if (provider === "facebook") {
    const facebookMedia = isReel ? primaryVideo : isStory ? primaryMedia : preview.mediaUrls[0];
    publication = await createFacebookOrganicPublication(tenantId, {
      text,
      mediaUrl: facebookMedia,
      mediaUrls: item.tipo === "carrossel" ? preview.mediaUrls : undefined,
      contentType: isReel ? "reel" : isStory ? "story" : item.tipo === "carrossel" ? "carousel" : preview.mediaUrls.length ? "image" : "post",
      mediaKind: isReel || (isStory && Boolean(primaryVideo)) ? "video" : isStory ? "image" : undefined,
    });
  } else if (provider === "linkedin") {
    publication = await createSocialPublication(tenantId, "linkedin", {
      text,
      mediaUrl: preview.mediaUrls[0],
      contentType: preview.mediaUrls.length ? "image" : "post",
    });
  } else {
    publication = await createSocialPublication(tenantId, provider, {
      text,
      mediaUrl: primaryVideo,
      contentType: item.tipo === "youtube_video" ? "video" : "short",
    });
  }

  const [linked] = await db.update(socialPublicationsTable).set({
    metadata: {
      ...(publication.metadata || {}),
      calendarItemId: item.id,
      contentGenerationId: item.contentGenerationId,
      source: "media-calendar",
      scheduleMode: "automatico",
      scheduledDate: item.dataAgendada,
      scheduledTime: input.time,
      scheduledTimezone: input.timezone,
      scheduleSource: item.horarioAgendado ? "calendar-item" : "plan-default",
    },
    updatedAt: new Date(),
  }).where(and(
    eq(socialPublicationsTable.id, publication.id),
    eq(socialPublicationsTable.tenantId, tenantId),
  )).returning();

  return linked ?? publication;
}

export async function enqueueDueMediaPlanPublications(now = new Date()) {
  const rows = await db.select({
    id: contentCalendarItemsTable.id,
    tenantId: contentCalendarItemsTable.tenantId,
    mediaPlanId: contentCalendarItemsTable.mediaPlanId,
    dataAgendada: contentCalendarItemsTable.dataAgendada,
    horarioAgendado: contentCalendarItemsTable.horarioAgendado,
    temaSugerido: contentCalendarItemsTable.temaSugerido,
    canal: contentCalendarItemsTable.canal,
    tipo: contentCalendarItemsTable.tipo,
    contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    variationIdx: contentCalendarItemsTable.variationIdx,
    planContent: mediaPlansTable.conteudo,
    generationResult: contentGenerationsTable.result,
  }).from(contentCalendarItemsTable)
    .innerJoin(mediaPlansTable, and(
      eq(mediaPlansTable.id, contentCalendarItemsTable.mediaPlanId),
      eq(mediaPlansTable.tenantId, contentCalendarItemsTable.tenantId),
    ))
    .innerJoin(contentGenerationsTable, and(
      eq(contentGenerationsTable.id, contentCalendarItemsTable.contentGenerationId),
      eq(contentGenerationsTable.tenantId, contentCalendarItemsTable.tenantId),
    ))
    .where(and(
      eq(contentCalendarItemsTable.status, "gerado"),
      isNotNull(contentCalendarItemsTable.contentGenerationId),
      isNull(contentCalendarItemsTable.contentIdPublicado),
      inArray(contentCalendarItemsTable.tipo, [...AUTO_TYPES]),
      sql`${mediaPlansTable.conteudo}->>'statusPlanejamento' = 'aprovado'`,
      sql`${mediaPlansTable.conteudo}->'publicacaoOrganica'->>'modo' = 'automatico'`,
    ))
    .orderBy(asc(contentCalendarItemsTable.dataAgendada), asc(contentCalendarItemsTable.horarioAgendado))
    .limit(MAX_DUE_ITEMS_PER_TICK);

  let queued = 0;
  for (const row of rows) {
    if (!row.contentGenerationId || !row.mediaPlanId) continue;
    const planContent = row.planContent;
    const settings = planContent.publicacaoOrganica ?? { modo: "manual" as const };
    const schedule = isDue(row.dataAgendada, row.horarioAgendado, settings, now);
    if (!schedule.due) continue;
    if (!providerFor(row)) continue;

    const existing = await existingPublicationForCalendarItem(row.tenantId, row.id);
    if (existing) continue;

    const claim = `queueing:${crypto.randomUUID()}`;
    const [claimed] = await db.update(contentCalendarItemsTable).set({
      contentIdPublicado: claim,
      updatedAt: new Date(),
    }).where(and(
      eq(contentCalendarItemsTable.id, row.id),
      eq(contentCalendarItemsTable.tenantId, row.tenantId),
      eq(contentCalendarItemsTable.status, "gerado"),
      isNull(contentCalendarItemsTable.contentIdPublicado),
    )).returning({ id: contentCalendarItemsTable.id });
    if (!claimed) continue;

    try {
      const publication = await createScheduledPublication({
        tenantId: row.tenantId,
        item: {
          id: row.id,
          canal: row.canal,
          tipo: row.tipo,
          temaSugerido: row.temaSugerido,
          dataAgendada: row.dataAgendada,
          horarioAgendado: row.horarioAgendado,
          contentGenerationId: row.contentGenerationId,
          variationIdx: row.variationIdx,
        },
        generationResult: row.generationResult,
        timezone: schedule.timezone,
        time: schedule.time,
      });
      if (!publication) {
        await db.update(contentCalendarItemsTable).set({ contentIdPublicado: null, updatedAt: new Date() }).where(and(
          eq(contentCalendarItemsTable.id, row.id),
          eq(contentCalendarItemsTable.contentIdPublicado, claim),
        ));
        continue;
      }
      await db.update(contentCalendarItemsTable).set({
        contentIdPublicado: publication.id,
        updatedAt: new Date(),
      }).where(and(
        eq(contentCalendarItemsTable.id, row.id),
        eq(contentCalendarItemsTable.contentIdPublicado, claim),
      ));
      queued += 1;
      logger.info({ tenantId: row.tenantId, calendarItemId: row.id, publicationId: publication.id, provider: publication.provider }, "Publicação orgânica agendada entrou na fila");
    } catch (error) {
      await db.update(contentCalendarItemsTable).set({ contentIdPublicado: null, updatedAt: new Date() }).where(and(
        eq(contentCalendarItemsTable.id, row.id),
        eq(contentCalendarItemsTable.contentIdPublicado, claim),
      )).catch(() => undefined);
      logger.warn({ error, tenantId: row.tenantId, calendarItemId: row.id }, "Não foi possível enfileirar publicação orgânica agendada");
    }
  }

  return queued;
}
