/**
 * Cmd 22 — Fase 6: Micro-eventos Automáticos
 *
 * Weekly cron job that re-scans active unconverted prospected leads:
 * - Reviews velocity spike → score boost + notification
 * - New site detected
 * Inserts lead_events records and bumps propensity_score temporarily.
 */
import { and, eq, inArray, isNotNull, gte, or } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  leadEventsTable,
  notificationsTable,
  tenantsTable,
} from "@workspace/db";

const SCORE_BOOST = 15;
const BOOST_DAYS = 7;

export async function runMicroEventsRescan(log: Logger): Promise<void> {
  log.info("micro-events: starting weekly rescan");

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  let totalEvents = 0;

  for (const tenant of tenants) {
    try {
      // Load active prospected leads (not converted, not discarded) with a score
      const leads = await db
        .select({
          id: leadsTable.id,
          nome: leadsTable.nome,
          propensityScore: leadsTable.propensityScore,
          enrichmentData: leadsTable.enrichmentData,
          metadata: leadsTable.metadata,
          enrichmentStatus: leadsTable.enrichmentStatus,
        })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.tenantId, tenant.id),
            inArray(leadsTable.source, ["prospector", "prospector_auto"]),
            inArray(leadsTable.enrichmentStatus, ["enriched", "scored", "dispatched"]),
            isNotNull(leadsTable.propensityScore),
          ),
        )
        .limit(200);

      for (const lead of leads) {
        try {
          const meta = (lead.metadata ?? {}) as Record<string, unknown>;
          const enrichData = (lead.enrichmentData ?? {}) as Record<string, unknown>;
          const growth = (enrichData["growth"] ?? {}) as Record<string, unknown>;

          const events: Array<{ tipo: string; descricao: string }> = [];

          // Check reviews velocity spike (simple heuristic: velocity > 6)
          const currentVelocity = Number(growth["reviews_velocity"] ?? 0);
          const prevVelocity = Number(meta["prev_reviews_velocity"] ?? 0);

          if (currentVelocity > 6 && currentVelocity > prevVelocity * 1.3) {
            events.push({
              tipo: "reviews_velocity_spike",
              descricao: `📈 ${Math.round(currentVelocity * 4)} avaliações estimadas em 30 dias — demanda em alta`,
            });
          }

          // Check for new site (site was absent before, now detected)
          const temSite = Boolean((enrichData["digital"] as Record<string, unknown> | null)?.["tem_site"]);
          const hadSite = Boolean(meta["had_site"]);
          if (temSite && !hadSite) {
            events.push({
              tipo: "new_site_detected",
              descricao: "🌐 Site detectado — empresa está investindo em presença digital",
            });
          }

          if (events.length === 0) continue;

          const expiresAt = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000);
          const newScore = Math.min(100, (lead.propensityScore ?? 50) + SCORE_BOOST);

          for (const event of events) {
            // Check if event already fired recently (avoid duplicate boosts)
            const recentEvent = await db
              .select({ id: leadEventsTable.id })
              .from(leadEventsTable)
              .where(
                and(
                  eq(leadEventsTable.leadId, lead.id),
                  eq(leadEventsTable.tipo, event.tipo),
                  gte(leadEventsTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
                ),
              )
              .limit(1);

            if (recentEvent.length > 0) continue;

            await db.insert(leadEventsTable).values({
              leadId: lead.id,
              tipo: event.tipo,
              descricao: event.descricao,
              scoreBoost: SCORE_BOOST,
              expiresAt,
            });

            // Boost score temporarily
            await db
              .update(leadsTable)
              .set({
                propensityScore: newScore,
                priorityReason: `${event.descricao} — score temporariamente aumentado`,
                updatedAt: new Date(),
                metadata: {
                  ...(meta as object),
                  prev_reviews_velocity: currentVelocity,
                  had_site: temSite,
                },
              })
              .where(eq(leadsTable.id, lead.id));

            // In-app notification
            await db.insert(notificationsTable).values({
              tenantId: tenant.id,
              title: "📈 Lead subiu na fila",
              body: `${lead.nome}: ${event.descricao}`,
              type: "info",
              metadata: { leadId: lead.id, tipo: event.tipo, scoreBoost: SCORE_BOOST },
            });

            totalEvents++;
          }
        } catch (err) {
          log.error({ err, leadId: lead.id, tenantId: tenant.id }, "micro-events: lead failed (non-fatal)");
        }
      }
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "micro-events: tenant failed (non-fatal)");
    }
  }

  log.info({ totalEvents }, "micro-events: rescan complete");
}
