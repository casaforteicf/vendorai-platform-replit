import { and, eq, lt, or } from "drizzle-orm";
import { db, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { produceUpcomingMediaPlanOrganicContent, reconcileAutomatedReelVideos } from "./media-plan-auto-production.js";
import { enqueueDueMediaPlanPublications } from "./media-plan-scheduled-publication.js";
import { publishAnySocialPublication } from "./social-publication-dispatcher.js";

const POLL_MS = 60_000;
const STALE_AFTER_MS = 15 * 60_000;
const BATCH_SIZE = 10;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function processPendingSocialPublications() {
  if (running) return;
  running = true;
  try {
    await produceUpcomingMediaPlanOrganicContent().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu produzir conteúdos próximos do Plano de Mídia");
    });
    await reconcileAutomatedReelVideos().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu reconciliar vídeos automáticos do Plano de Mídia");
    });
    await enqueueDueMediaPlanPublications().catch((error) => {
      logger.warn({ error }, "Worker social não conseguiu preparar publicações vencidas do Plano de Mídia");
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
  logger.info({ pollMs: POLL_MS, staleAfterMs: STALE_AFTER_MS }, "Worker de publicações sociais iniciado");
}
