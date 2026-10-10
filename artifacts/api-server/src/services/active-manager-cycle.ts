import type { Logger } from "pino";
import { pool } from "@workspace/db";
import { classifyManagerDemand, managerExecutionBucket, MANAGER_INTERVAL_MINUTES, type ManagerDomain } from "./agent-manager-policy.js";

/**
 * AGENT-01: conservative periodic opportunity scan. Creates Jarvis cases only;
 * it NEVER contacts customers, executes business actions or changes platform code.
 * The Jarvis proactivity surface can consume these cases with its existing RBAC.
 */
const DOMAINS: Array<Exclude<ManagerDomain, "security">> = [
  "crm", "pipeline", "marketing", "agenda", "proposals", "integrations",
];
let running = false;

export async function runActiveManagerCycle(log: Logger, now = new Date()) {
  // Reject an invalid scheduling clock before opening a transaction or acquiring locks.
  if (!Number.isFinite(now.getTime())) {
    log.warn("active-managers: invalid cycle timestamp; scan skipped");
    return;
  }
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
      // Fail with a clear prerequisite error instead of partially scanning tenants
      // when the release migration has not been applied in homologation.
      const ready = await client.query(
        "SELECT to_regclass('public.agent_manager_runs') AS runs, to_regclass('public.jarvis_cases') AS cases, to_regclass('public.notifications') AS notifications, to_regclass('public.users') AS users",
      );
      if (!ready.rows[0]?.runs || !ready.rows[0]?.cases || !ready.rows[0]?.notifications || !ready.rows[0]?.users) {
        throw new Error("AGENT_MANAGER_MIGRATION_PENDING");
      }
      // Deterministic pagination prevents permanent starvation of tenants beyond
      // the first 500, while keeping each transaction bounded.
      const tenantCount = await client.query(
        "SELECT count(*)::int AS total FROM tenants WHERE status='active'",
      );
      const totalTenants = Number(tenantCount.rows[0]?.total ?? 0);
      if (totalTenants === 0) {
        await client.query("COMMIT");
        log.info({ scanned: 0, cases: 0, resolved: 0, tenantFailures: 0 }, "active-managers: no active tenants");
        return;
      }
      const pageCount = Math.max(1, Math.ceil(totalTenants / 500));
      const domainIds = new Map<Exclude<ManagerDomain, "security">, Set<string>>();
      const tenantIds = new Set<string>();
      for (const domain of DOMAINS) {
        const interval = MANAGER_INTERVAL_MINUTES[domain];
        const bucket = Math.floor(now.getTime() / (interval * 60_000));
        const offset = (bucket % pageCount) * 500;
        const page = await client.query(
          "SELECT id FROM tenants WHERE status='active' ORDER BY id LIMIT 500 OFFSET $1",
          [offset],
        );
        const ids = new Set<string>(page.rows.map((row: { id: string }) => row.id));
        domainIds.set(domain, ids);
        ids.forEach((id) => tenantIds.add(id));
      }
      let scanned = 0;
      let cases = 0;
      let resolved = 0;
      let tenantFailures = 0;
      for (const tenantId of tenantIds) {
        await client.query('SAVEPOINT manager_tenant');
        try {
        for (const domain of DOMAINS) {
          if (!domainIds.get(domain)?.has(tenantId)) continue;
          await client.query('SAVEPOINT manager_domain');
          try {
          // The scheduler may fire seconds late. Bucket-level dedupe, not an
          // exact minute equality, controls whether a scan has already run.
          const periodKey = managerExecutionBucket(domain, now);
          const alreadyDone = await client.query(
            "SELECT 1 FROM agent_manager_runs WHERE tenant_id=$1 AND domain=$2 AND period_key=$3 LIMIT 1",
            [tenantId, domain, periodKey],
          );
          if (alreadyDone.rowCount) {
            await client.query('RELEASE SAVEPOINT manager_domain');
            continue;
          }
          scanned++;
          // Initial deterministic opportunities: no AI or assumptions needed.
          // Other domains record a periodic scan in logs, not fabricated cases.
          let observation: { signal: string; title: string; detail: string; metric: string } | undefined;
          if (domain === "pipeline") {
            const data = await client.query(
              `SELECT count(*)::int AS total FROM activities
                WHERE tenant_id=$1 AND status IN ('pendente','planejado')
                  AND data_vencimento < now() - interval '24 hours'
                  AND EXISTS (SELECT 1 FROM leads l WHERE l.id=activities.lead_id
                    AND l.tenant_id=activities.tenant_id AND l.excluido_em IS NULL
                    AND l.nao_lead_tipo IS NULL AND l.status NOT IN ('cliente','perdido'))`,
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
          if (domain === "agenda") {
            const data = await client.query(
              `SELECT count(*)::int AS total FROM agendamentos a
               JOIN leads l ON l.id=a.lead_id AND l.tenant_id=a.tenant_id
               WHERE a.tenant_id=$1 AND a.status IN ('agendado','confirmado')
                 AND a.data_hora_inicio < now() - interval '2 hours'
                 AND l.excluido_em IS NULL AND l.nao_lead_tipo IS NULL`,
              [tenantId],
            );
            const total = Number(data.rows[0]?.total ?? 0);
            if (total > 0) observation = {
              signal: "active-manager:agenda:unclosed-past-appointments",
              title: "Agendamentos anteriores ainda sem encerramento",
              detail: `Há ${total} agendamentos com início há mais de duas horas ainda marcados como agendados ou confirmados. Jarvis deve orientar a equipe para registrar o resultado.`,
              metric: String(total),
            };
          }
          if (domain === "proposals") {
            const data = await client.query(
              `SELECT count(*)::int AS total FROM lead_proposals p
               JOIN leads l ON l.id=p.lead_id AND l.tenant_id=p.tenant_id
               WHERE p.tenant_id=$1 AND p.status='ready'
                 AND p.created_at < now() - interval '7 days'
                 AND l.excluido_em IS NULL AND l.nao_lead_tipo IS NULL
                 AND l.status NOT IN ('cliente','perdido')`,
              [tenantId],
            );
            const total = Number(data.rows[0]?.total ?? 0);
            if (total > 0) observation = {
              signal: "active-manager:proposals:stale-ready-proposals",
              title: "Propostas prontas aguardando acompanhamento",
              detail: `Há ${total} versões de propostas prontas há mais de sete dias. Jarvis deve revisar com o tenant antes de qualquer contato com clientes.`,
              metric: String(total),
            };
          }
          if (domain === "integrations") {
            const data = await client.query(
              `SELECT
                (SELECT count(*)::int FROM whatsapp_connections
                   WHERE tenant_id=$1 AND disconnected_at IS NULL
                     AND token_expires_at IS NOT NULL
                     AND token_expires_at < now() + interval '48 hours')
                +
                (SELECT count(*)::int FROM instagram_connections
                   WHERE tenant_id=$1 AND disconnected_at IS NULL
                     AND token_expires_at IS NOT NULL
                     AND token_expires_at < now() + interval '48 hours')
                AS total`,
              [tenantId],
            );
            const total = Number(data.rows[0]?.total ?? 0);
            if (total > 0) observation = {
              signal: "active-manager:integrations:expiring-tokens",
              title: "Conexões sociais com credenciais próximas do vencimento",
              detail: `Há ${total} conexões WhatsApp ou Instagram com token expirado ou vencendo em até 48 horas. Jarvis deve orientar o administrador a verificar a reconexão; nunca expor credenciais.`,
              metric: String(total),
            };
          }
          if (!observation) {
            const signals: Record<string, string> = {
              pipeline: 'active-manager:pipeline:overdue-activities',
              crm: 'active-manager:crm:unassigned-leads',
              marketing: 'active-manager:marketing:old-drafts',
              agenda: 'active-manager:agenda:unclosed-past-appointments',
              proposals: 'active-manager:proposals:stale-ready-proposals',
              integrations: 'active-manager:integrations:expiring-tokens',
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
            await client.query('RELEASE SAVEPOINT manager_domain');
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
               status=CASE WHEN jarvis_cases.status='resolved' AND jarvis_cases.result_summary='O sinal operacional deixou de existir na verificação automática.' THEN 'open' ELSE jarvis_cases.status END,
               resolved_at=CASE WHEN jarvis_cases.status='resolved' AND jarvis_cases.result_summary='O sinal operacional deixou de existir na verificação automática.' THEN NULL ELSE jarvis_cases.resolved_at END,
               result_summary=CASE WHEN jarvis_cases.status='resolved' AND jarvis_cases.result_summary='O sinal operacional deixou de existir na verificação automática.' THEN NULL ELSE jarvis_cases.result_summary END
             WHERE jarvis_cases.source='active_manager'
             RETURNING id`,
            [tenantId, observation.signal, domain, observation.title, observation.detail,
              observation.metric, JSON.stringify({ domain, scannedAt: now.toISOString(), total: observation.metric }),
              "Jarvis: avaliar com o tenant e solicitar aprovação para qualquer operação necessária."],
          );
          // A collision with a case owned by another source is intentionally
          // not updated by the upsert. Record a skipped scan, not a finding.
          if ((inserted.rowCount ?? 0) === 0) {
            log.warn({ tenantId, domain, signal: observation.signal },
              "active-managers: signal belongs to another Jarvis source; skipping");
            await client.query(
              "INSERT INTO agent_manager_runs (tenant_id,domain,period_key,outcome,finding_count) VALUES ($1,$2,$3,'skipped_source_collision',0) ON CONFLICT DO NOTHING",
              [tenantId, domain, periodKey],
            );
            await client.query('RELEASE SAVEPOINT manager_domain');
            continue;
          }
          // Respect manual case closure: only notify while the corresponding
          // Jarvis case is open after the upsert (automatic closure can reopen).
          const activeCase = await client.query(
            "SELECT status FROM jarvis_cases WHERE tenant_id=$1 AND signal_key=$2 AND source='active_manager'",
            [tenantId, observation.signal],
          );
          if (activeCase.rows[0]?.status !== 'open') {
            await client.query(
              "INSERT INTO agent_manager_runs (tenant_id,domain,period_key,outcome,finding_count) VALUES ($1,$2,$3,'completed',1) ON CONFLICT DO NOTHING",
              [tenantId, domain, periodKey],
            );
            await client.query('RELEASE SAVEPOINT manager_domain');
            // Manual closure remains authoritative; do not count it as an active finding.
            continue;
          }
          // Deliver a tenant-scoped, in-app Jarvis alert to one active admin.
          // Never send WhatsApp/email or perform an external action here.
          // One notification per tenant and issue within 24h prevents alert floods,
          // even when the active tenant administrator changes.
          // Advisory transaction lock serializes notifications for this
          // tenant+signal across workers, including concurrent scheduler runs.
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
            [tenantId, observation.signal],
          );
          await client.query(
            `INSERT INTO notifications
               (id, tenant_id, recipient_user_id, title, message, type, category)
             SELECT gen_random_uuid(), $1, u.id, $2, $3, 'info', 'active_manager'
             FROM users u
             WHERE u.tenant_id=$1 AND u.active=true
               AND (u.role='admin' OR u.platform_role='tenant_admin')
               AND NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.tenant_id=$1
                   AND n.category='active_manager' AND n.title=$2
                   AND n.created_at > now() - interval '24 hours'
               )
             ORDER BY u.id LIMIT 1`,
            [tenantId, observation.title, observation.detail],
          );
          await client.query(
            "INSERT INTO agent_manager_runs (tenant_id,domain,period_key,outcome,finding_count) VALUES ($1,$2,$3,'completed',1) ON CONFLICT DO NOTHING",
            [tenantId, domain, periodKey],
          );
          await client.query('RELEASE SAVEPOINT manager_domain');
          cases += inserted.rowCount ?? 0;
          } catch (domainError) {
            await client.query('ROLLBACK TO SAVEPOINT manager_domain');
            await client.query('RELEASE SAVEPOINT manager_domain');
            tenantFailures++;
            log.warn({ err: domainError, tenantId, domain }, 'active-managers: domain scan rolled back');
          }
        }
        await client.query('RELEASE SAVEPOINT manager_tenant');
        } catch (tenantError) {
          await client.query('ROLLBACK TO SAVEPOINT manager_tenant');
          await client.query('RELEASE SAVEPOINT manager_tenant');
          tenantFailures++;
          log.warn({ err: tenantError, tenantId }, 'active-managers: tenant scan rolled back');
        }
      }
      await client.query("COMMIT");
      log.info({ scanned, cases, resolved, tenantFailures, at: now.toISOString() }, "active-managers: periodic cycle committed");
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
