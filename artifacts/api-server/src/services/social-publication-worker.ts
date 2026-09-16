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
const PERFORMANCE_INTERVAL_MS = 6 * 60 * 60_000;
const PERFORMANCE_POST_AGE_MS = 24 * 60 * 60_000;
const PERFORMANCE_TENANT_BATCH = 20;

const AUTO_MEDIA_PLAN_PRODUCTION_ENABLED =
  process.env["MARKETING_AUTO_PRODUCTION_ENABLED"] === "true";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastPerformanceRunAt = 0;
let databaseAuthBlocked = false;

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  return databaseErrorCode(cause);
}

function isDatabaseAuthenticationFailure(error: unknown): boolean {
  const code = databaseErrorCode(error);
  if (code === "28P01") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /password authentication failed|too many authentication failures/i.test(message);
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
  if (running || databaseAuthBlocked) return;
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
  } catch (error) {
    if (isDatabaseAuthenticationFailure(error)) {
      databaseAuthBlocked = true;
      logger.error(
        { error },
        "Worker social pausado: credencial do banco inválida. Corrija APP_DATABASE_URL e redeploye para reativar o worker.",
      );
      return;
    }
    logger.error({ error }, "Worker social encontrou erro não tratado; ciclo foi encerrado sem derrubar a API");
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
      performanceIntervalMs: PERFORMANCE_INTERVAL_MS,
      performancePostAgeMs: PERFORMANCE_POST_AGE_MS,
      autoMediaPlanProductionEnabled: AUTO_MEDIA_PLAN_PRODUCTION_ENABLED,
    },
    "Worker de publicações sociais iniciado",
  );
}
