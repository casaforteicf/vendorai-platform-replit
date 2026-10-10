import type { Logger } from "pino";
import { pool } from "@workspace/db";
import { classifyManagerDemand, managerExecutionBucket, MANAGER_INTERVAL_MINUTES, type ManagerDomain } from "./agent-manager-policy.js";

/**
 * AGENT-01: conservative periodic opportunity scan. Creates Jarvis cases only;
 * it NEVER contacts customers, executes business actions or changes platform code.
 * The Jarvis proactivity surface can consume these cases with its existing RBAC.
 */
const DOMAINS: Array<Exclude<ManagerDomain, "security">> = [
  "crm", "pipeline", "marketing",
];
let running = false;

export async function runActiveManagerCycle(log: Logger, now = new Date()) {
  if (running) return;
  running = true;
  try {
    // A PostgreSQL advisory transaction lock prevents concurrent workers from
    // creating duplicate cases. No lock is held during external network calls.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lock = await client.query("SELECT pg_try_advisory_xact_lock(18011, 1) AS acquired");
      if (!lock.rows[0]?.acquired) {
        await client.query("ROLLBACK");
        return;
      }
      const tenants = await client.query(
        "SELECT id FROM tenants WHERE status='active' LIMIT 500",
      );
      let scanned = 0;
      let cases = 0;
      let resolved = 0;
      for (const row of tenants.rows) {
        const tenantId: string = row.id;
        for (const domain of DOMAINS) {
          const minutes = MANAGER_INTERVAL_MINUTES[domain];
          if (Math.floor(now.getTime() / 60000) % minutes !== 0) continue;
          scanned++;
          const periodKey = managerExecutionBucket(domain, now);
          // Initial deterministic opportunities: no AI or assumptions needed.
          // Other domains record a periodic scan in logs, not fabricated cases.
          let observation: { signal: string; title: string; detail: string; metric: string } | undefined;
          if (domain === "pipeline") {
            const data = await client.query(
              `SELECT count(*)::int AS total FROM activities
                WHERE tenant_id=$1 AND status IN ('pendente','planejado')
                  AND data_vencimento < now() - interval '24 hours'`,
              [tenantId],
            );
            const total = Number(data.rows[0]?.total ?? 0);
            if (total > 0) observation = {
              signal: "active-manager:pipeline:overdue-activities",
              title: "Atividades comerciais vencidas precisam de acompanhamento",
              detail: `Existem ${total} atividades vencidas há mais de 24 horas. Jarvis deve orientar o responsável e sugerir priorização; não executar ações sem permissão.`,
              metric: String(total),
            };
          }
          if (domain === "crm") {
            const data = await client.query(
              `SELECT count(*)::int AS total FROM leads
                WHERE tenant_id=$1 AND assigned_to IS NULL
                  AND representative_function_id IS NULL AND excluido_em IS NULL AND nao_lead_tipo IS NULL
                  AND status NOT IN ('cliente','perdido')`,
              [tenantId],
            );
            const total = Number(data.rows[0]?.total ?? 0);
            if (total > 0) observation = {
              signal: "active-manager:crm:unassigned-leads",
              title: "Leads ativos sem responsável",
              detail: `Foram encontrados ${total} leads sem responsável. Jarvis deve recomendar a atribuição a um membro autorizado do tenant.`,
              metric: String(total),
            };
          }
          if (domain === "marketing") {
            // Positive opportunity: review stalled drafts without presuming an error.
            const data = await client.query(
              `SELECT count(*)::int AS total FROM campaigns
                WHERE tenant_id=$1 AND status='rascunho'
                  AND created_at < now() - interval '7 days'`,
              [tenantId],
            );
            const total = Number(data.rows[0]?.total ?? 0);
            if (total > 0) observation = {
              signal: "active-manager:marketing:old-drafts",
              title: "Campanhas em rascunho podem representar oportunidades",
              detail: `Há ${total} campanhas em rascunho há mais de sete dias. Jarvis deve perguntar se o tenant deseja revisá-las; nunca publicar sem autorização.`,
              metric: String(total),
            };
          }
          if (!observation) {
            const signals: Record<string, string> = {
              pipeline: 'active-manager:pipeline:overdue-activities',
              crm: 'active-manager:crm:unassigned-leads',
              marketing: 'active-manager:marketing:old-drafts',
            };
            const signal = signals[domain];
            if (signal) {
              const closed = await client.query(
                `UPDATE jarvis_cases SET status='resolved', resolved_at=now(),
                    updated_at=now(),
                    result_summary='O sinal operacional deixou de existir na verificação automática.'
                  WHERE tenant_id=$1 AND signal_key=$2
                    AND source='active_manager' AND status='open'`,
                [tenantId, signal],
              );
              resolved += closed.rowCount ?? 0;
            }
            await client.query(
              "INSERT INTO agent_manager_runs (tenant_id,domain,period_key,outcome,finding_count) VALUES ($1,$2,$3,'completed',0) ON CONFLICT DO NOTHING",
              [tenantId, domain, periodKey],
            );
            continue;
          }
          const decision = classifyManagerDemand("tenant_operation");
          if (decision.route !== "jarvis") throw new Error("ROUTING_POLICY_MISMATCH");
          const inserted = await client.query(
            `INSERT INTO jarvis_cases
             (id,tenant_id,signal_key,source,category,severity,title,detail,metric,status,evidence,recommended_action)
             VALUES (gen_random_uuid()::text,$1,$2,'active_manager',$3,'attention',$4,$5,$6,'open',$7::jsonb,$8)
             ON CONFLICT (tenant_id,signal_key) DO UPDATE SET
               last_detected_at=now(),updated_at=now(),metric=EXCLUDED.metric,
               detail=EXCLUDED.detail,evidence=EXCLUDED.evidence,
               status=CASE WHEN jarvis_cases.status='resolved' THEN 'open' ELSE jarvis_cases.status END,
               resolved_at=CASE WHEN jarvis_cases.status='resolved' THEN NULL ELSE jarvis_cases.resolved_at END
             RETURNING id`,
            [tenantId, observation.signal, domain, observation.title, observation.detail,
              observation.metric, JSON.stringify({ domain, scannedAt: now.toISOString(), total: observation.metric }),
              "Jarvis: avaliar com o tenant e solicitar aprovação para qualquer operação necessária."],
          );
          cases += inserted.rowCount ?? 0;
          await client.query(
            "INSERT INTO agent_manager_runs (tenant_id,domain,period_key,outcome,finding_count) VALUES ($1,$2,$3,'completed',1) ON CONFLICT DO NOTHING",
            [tenantId, domain, periodKey],
          );
        }
      }
      await client.query("COMMIT");
      log.info({ scanned, cases, resolved, at: now.toISOString() }, "active-managers: periodic cycle committed");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    log.error({ err: error }, "active-managers: periodic cycle failed");
  } finally {
    running = false;
  }
}
