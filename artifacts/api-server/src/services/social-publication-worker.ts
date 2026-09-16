import { and, eq, isNull, lt, or } from "drizzle-orm";
import { contentPublishedPostsTable, db, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { produceUpcomingMediaPlanOrganicContent, reconcileAutomatedReelVideos } from "./media-plan-auto-production.js";
import { enqueueDueMediaPlanPublications } from "./media-plan-scheduled-publication.js";
import { publishAnySocialPublication } from "./social-publication-dispatcher.js";
import {
  PerformanceError,
  refreshPendingMetrics,
  refreshPerformanceInsights,
} from "./content-performance.js";

const POLL_MS = 60_000;
const STALE_AFTER_MS = 15 * 60_000;
const BATCH_SIZE = 10;
const SCHEDULE_BATCH_SIZE = 50;
const PERFORMANCE_INTERVAL_MS = 6 * 60 * 60_000;
const PERFORMANCE_POST_AGE_MS = 24 * 60 * 60_000;
const PERFORMANCE_TENANT_BATCH = 20;

// Safety-first: automatic AI materialization from approved media plans is OFF
// unless production explicitly opts in. This prevents a failed provider call
// from being retried by the social worker every minute and consuming API credit.
const AUTO_MEDIA_PLAN_PRODUCTION_ENABLED =
  process.env["MARKETING_AUTO_PRODUCTION_ENABLED"] === "true";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastPerformanceRunAt = 0;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function releaseDueScheduledPublications(now = new Date()) {
  const scheduled = await db.select({
    id: socialPublicationsTable.id,
    tenantId: socialPublicationsTable.tenantId,
    metadata: socialPublicationsTable.metadata,
  }).from(socialPublicationsTable)
    .where(eq(socialPublicationsTable.status, "scheduled"))
    .limit(SCHEDULE_BATCH_SIZE);

  for (const item of scheduled) {
    const metadata = asRecord(item.metadata);
    const scheduledAtRaw = typeof metadata.scheduledAt === "string" ? metadata.scheduledAt : "";
    if (!scheduledAtRaw) continue;
    const scheduledAt = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() > now.getTime()) continue;

    const [claimed] = await db.update(socialPublicationsTable).set({
      status: "queued",
      metadata: {
        ...metadata,
        scheduleReleasedAt: now.toISOString(),
      },
      updatedAt: now,
    }).where(and(
      eq(socialPublicationsTable.id, item.id),
      eq(socialPublicationsTable.tenantId, item.tenantId),
      eq(socialPublicationsTable.status, "scheduled"),
    )).returning({
      id: socialPublicationsTable.id,
      tenantId: socialPublicationsTable.tenantId,
    });

    if (!claimed) continue;
    try {
      await publishAnySocialPublication(claimed.tenantId, claimed.id);
      logger.info(
        { tenantId: claimed.tenantId, publicationId: claimed.id, scheduledAt: scheduledAtRaw },
        "Publicação agendada pelo Video Studio foi liberada para publicação",
      );
    } catch (error) {
      logger.warn(
        { error, tenantId: claimed.tenantId, publicationId: claimed.id, scheduledAt: scheduledAtRaw },
        "Worker social não conseguiu publicar item agendado pelo Video Studio",
      );
    }
  }
}

async function processDueContentPerformanceLearning() {
  const now = Date.now();
  if (now - lastPerformanceRunAt < PERFORMANCE_INTERVAL_MS) return;
  lastPerformanceRunAt = now;

  const cutoff = new Date(now - PERFORMANCE_POST_AGE_MS);
  const duePosts = await db
    .select({ tenantId: contentPublishedPostsTable.tenantId })
    .from(contentPublishedPostsTable)
    .where(
      and(
        lt(contentPublishedPostsTable.publishedAt, cutoff),
        or(
          isNull(contentPublishedPostsTable.ultimaColetaEm),
          lt(contentPublishedPostsTable.ultimaColetaEm, cutoff),
        ),
      ),
    )
    .limit(PERFORMANCE_TENANT_BATCH * 10);

  const tenantIds = [...new Set(duePosts.map((row) => row.tenantId))].slice(0, PERFORMANCE_TENANT_BATCH);
  if (tenantIds.length === 0) return;

  for (const tenantId of tenantIds) {
    try {
      const metrics = await refreshPendingMetrics(tenantId);
      if (metrics.atualizados === 0) continue;

      try {
        const insight = await refreshPerformanceInsights(tenantId);
        logger.info(
          { tenantId, atualizados: metrics.atualizados, baseadoEmPosts: insight.baseadoEmPosts },
          "Worker social atualizou métricas e aprendizado de conteúdo automaticamente",
        );
      } catch (error) {
        if (error instanceof PerformanceError) {
          logger.info(
            { tenantId, atualizados: metrics.atualizados, reason: error.message },
            "Worker social coletou métricas; aprendizado aguarda volume mínimo de posts",
          );
          continue;
        }
        throw error;
      }
    } catch (error) {
      logger.warn({ error, tenantId }, "Worker social não conseguiu atualizar aprendizado de performance");
    }
  }
}

export async function processPendingSocialPublications() {
  if (running) return;
  running = true;
  try {
    if (AUTO_MEDIA_PLAN_PRODUCTION_ENABLED) {
      await produceUpcomingMediaPlanOrganicContent().catch((error) => {
        logger.warn({ error }, "Worker social não conseguiu produzir conteúdos próximos do Plano de Mídia");
      });
    }

    await reconcileAutomatedReelVideos().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu reconciliar vídeos automáticos do Plano de Mídia");
    });
    await enqueueDueMediaPlanPublications().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu preparar publicações vencidas do Plano de Mídia");
    });
    await releaseDueScheduledPublications().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu liberar publicações agendadas do Video Studio");
    });
    await processDueContentPerformanceLearning().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu processar aprendizado automático de performance");
    });

    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    const pending = await db.select({
      id: socialPublicationsTable.id,
      tenantId: socialPublicationsTable.tenantId,
    }).from(socialPublicationsTable).where(or(
      eq(socialPublicationsTable.status, "queued"),
      and(
        eq(socialPublicationsTable.status, "publishing"),
        lt(socialPublicationsTable.updatedAt, staleBefore),
      ),
    )).limit(BATCH_SIZE);

    for (const publication of pending) {
      try {
        await publishAnySocialPublication(publication.tenantId, publication.id);
      } catch (error) {
        logger.warn({ error, tenantId: publication.tenantId, publicationId: publication.id }, "Worker social não conseguiu concluir publicação");
      }
    }
  } finally {
    running = false;
  }
}

export function startSocialPublicationWorker() {
  if (timer || process.env["NODE_ENV"] === "test") return;
  void processPendingSocialPublications();
  timer = setInterval(() => { void processPendingSocialPublications(); }, POLL_MS);
  timer.unref?.();
  logger.info(
    {
      pollMs: POLL_MS,
      staleAfterMs: STALE_AFTER_MS,
      scheduleBatchSize: SCHEDULE_BATCH_SIZE,
      performanceIntervalMs: PERFORMANCE_INTERVAL_MS,
      performancePostAgeMs: PERFORMANCE_POST_AGE_MS,
      autoMediaPlanProductionEnabled: AUTO_MEDIA_PLAN_PRODUCTION_ENABLED,
    },
    "Worker de publicações sociais iniciado",
  );
}
