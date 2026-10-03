import { randomUUID, createHash } from "crypto";
import type { Logger } from "pino";
import { pool } from "@workspace/db";
import { executeDevAutonomousWork } from "../routes/dev_agent_autonomy.js";

type Severity = "baixa" | "media" | "alta" | "urgente";

type AuditFinding = {
  key: string;
  title: string;
  description: string;
  module: string;
  priority: Severity;
  riskSummary: string;
  acceptanceCriteria: string;
};

const FAST_INTERVAL_MS = 15 * 60 * 1000;
const DEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let started = false;
let fastRunning = false;
let deepRunning = false;

function fingerprint(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function isNightAuditWindow() {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
  return hour >= 22 || hour < 6;
}

async function runEmergencyRemediation(improvementId: string, finding: AuditFinding, log: Logger) {
  if (finding.priority !== "urgente") return;

  const recent = await pool.query(
    `SELECT 1 FROM admin_improvement_events
      WHERE improvement_id=$1
        AND event_type='emergency_remediation_started'
        AND created_at > now() - interval '30 minutes'
      LIMIT 1`,
    [improvementId],
  );
  if (recent.rowCount) return;

  await pool.query(
    `UPDATE admin_improvements
        SET status='em_desenvolvimento',
            owner_agent='audit_24x7',
            agent_status='emergency_running',
            updated_at=now()
      WHERE id=$1`,
    [improvementId],
  );

  await pool.query(
    `INSERT INTO admin_improvement_events
      (id, improvement_id, event_type, message, actor, payload)
     VALUES ($1,$2,'emergency_remediation_started',$3,'audit_24x7',$4::jsonb)`,
    [
      randomUUID(),
      improvementId,
      "Falha crítica detectada. Correção emergencial automática iniciada imediatamente.",
      JSON.stringify({ auditKey: finding.key, priority: finding.priority }),
    ],
  ).catch(() => undefined);

  try {
    const result = await executeDevAutonomousWork({
      requestId: improvementId,
      request: [
        "INCIDENTE CRÍTICO P0/P1 detectado pela auditoria contínua.",
        "Objetivo: restaurar o funcionamento do VendorAI imediatamente.",
        "Aplique a menor correção reversível possível, use fallback seguro quando houver,",
        "valide a correção e não declare resolvido sem evidência real de runtime.",
        "Se uma tentativa falhar, preserve o estado anterior/rollback e tente a alternativa segura permitida.",
        "",
        finding.title,
        finding.description,
        `Critério de aceite: ${finding.acceptanceCriteria}`,
      ].join("\n"),
      diagnosis: `${finding.riskSummary}\nOrigem: continuous-audit 24x7\nChave: ${finding.key}`,
      route: "/audit/emergency",
      source: "super_admin",
    });

    const status = String((result as any)?.status ?? ((result as any)?.success === false ? "failed" : "completed"));
    const summary = String((result as any)?.summary ?? (result as any)?.error ?? "Execução emergencial concluída sem resumo.").slice(0, 12000);

    await pool.query(
      `UPDATE admin_improvements
          SET agent_status=$2,
              agent_summary=$3,
              status=CASE
                WHEN $2='approval_required' THEN 'bloqueada'
                WHEN $2 IN ('failed','error') THEN 'em_desenvolvimento'
                ELSE status
              END,
              updated_at=now()
        WHERE id=$1`,
      [improvementId, status, summary],
    );

    await pool.query(
      `INSERT INTO admin_improvement_events
        (id, improvement_id, event_type, message, actor, payload)
       VALUES ($1,$2,'emergency_remediation_result',$3,'audit_24x7',$4::jsonb)`,
      [
        randomUUID(),
        improvementId,
        summary.slice(0, 6000),
        JSON.stringify({ status, success: (result as any)?.success ?? null }),
      ],
    ).catch(() => undefined);

    log.warn({ improvementId, status, key: finding.key }, "continuous-audit: correção emergencial executada");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE admin_improvements
          SET agent_status='emergency_failed',
              agent_summary=$2,
              updated_at=now()
        WHERE id=$1`,
      [improvementId, message.slice(0, 12000)],
    ).catch(() => undefined);

    await pool.query(
      `INSERT INTO admin_improvement_events
        (id, improvement_id, event_type, message, actor, payload)
       VALUES ($1,$2,'emergency_remediation_failed',$3,'audit_24x7',$4::jsonb)`,
      [randomUUID(), improvementId, message.slice(0, 6000), JSON.stringify({ auditKey: finding.key })],
    ).catch(() => undefined);

    log.error({ err: error, improvementId, key: finding.key }, "continuous-audit: correção emergencial falhou");
  }
}

async function ensureAuditTablesAvailable() {
  const result = await pool.query(
    "SELECT to_regclass('public.admin_improvements') AS improvements, to_regclass('public.admin_improvement_events') AS events",
  );
  return Boolean(result.rows[0]?.improvements && result.rows[0]?.events);
}

async function upsertFinding(finding: AuditFinding, log: Logger) {
  if (!(await ensureAuditTablesAvailable())) {
    log.warn("continuous-audit: Central de Melhorias ainda não está disponível");
    return;
  }

  const sourceRefId = `audit:${fingerprint(finding.key)}`;
  const existing = await pool.query(
    `SELECT id, status FROM admin_improvements
      WHERE source_type='audit' AND source_ref_id=$1
      ORDER BY created_at DESC LIMIT 1`,
    [sourceRefId],
  );

  if (existing.rowCount) {
    const row = existing.rows[0];
    if (["producao_validada", "cancelada"].includes(String(row.status))) return;

    await pool.query(
      `UPDATE admin_improvements
          SET title=$2, description=$3, module=$4, priority=$5,
              risk_summary=$6, acceptance_criteria=$7,
              owner_agent='audit_24x7', agent_status='detected',
              agent_summary=$3, updated_at=now()
        WHERE id=$1`,
      [row.id, finding.title, finding.description, finding.module, finding.priority, finding.riskSummary, finding.acceptanceCriteria],
    );

    await pool.query(
      `INSERT INTO admin_improvement_events
        (id, improvement_id, event_type, message, actor, payload)
       VALUES ($1,$2,'audit_recheck',$3,'audit_24x7',$4::jsonb)`,
      [randomUUID(), row.id, "Agente de Auditoria 24/7 confirmou que o sinal continua presente.", JSON.stringify({ auditKey: finding.key, priority: finding.priority })],
    ).catch(() => undefined);
    await runEmergencyRemediation(row.id, finding, log);
    return;
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO admin_improvements
      (id,title,description,module,priority,status,source_type,source_ref_id,
       acceptance_criteria,risk_summary,owner_agent,agent_status,agent_summary,test_status,created_by)
     VALUES ($1,$2,$3,$4,$5,'solicitada','audit',$6,$7,$8,'audit_24x7','detected',$3,'pending','audit_24x7')`,
    [id, finding.title, finding.description, finding.module, finding.priority, sourceRefId, finding.acceptanceCriteria, finding.riskSummary],
  );

  await pool.query(
    `INSERT INTO admin_improvement_events
      (id, improvement_id, event_type, message, actor, payload)
     VALUES ($1,$2,'audit_detected',$3,'audit_24x7',$4::jsonb)`,
    [randomUUID(), id, "Agente de Auditoria 24/7 detectou automaticamente esta ocorrência.", JSON.stringify({ auditKey: finding.key, priority: finding.priority })],
  ).catch(() => undefined);

  log.warn({ improvementId: id, title: finding.title }, "continuous-audit: nova ocorrência registrada");
  await runEmergencyRemediation(id, finding, log);
}

async function auditDatabaseSchema(): Promise<AuditFinding[]> {
  const criticalTables = [
    "tenants", "leads", "deals", "agent_tasks", "agent_configs",
    "messages", "conversations", "admin_improvements", "admin_improvement_events",
  ];
  const result = await pool.query(
    `SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS name`,
    [criticalTables],
  );

  return result.rows.filter((row) => !row.present).map((row) => ({
    key: `schema:missing-table:${row.name}`,
    title: `Tabela crítica ausente: ${row.name}`,
    description: `A auditoria automática não encontrou a tabela pública "${row.name}". Isso pode causar falhas sistêmicas ou erros 500 em rotas dependentes.`,
    module: "Banco / Schema",
    priority: "urgente" as const,
    riskSummary: "Risco alto de indisponibilidade funcional e divergência entre código e banco.",
    acceptanceCriteria: `A tabela ${row.name} deve existir no schema de runtime e as rotas dependentes devem passar em teste de regressão.`,
  }));
}

async function auditImprovementFlow(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  const blocked = await pool.query(
    `SELECT count(*)::int AS total FROM admin_improvements
      WHERE status='bloqueada' AND updated_at < now() - interval '2 hours'`,
  );
  const blockedCount = Number(blocked.rows[0]?.total ?? 0);
  if (blockedCount > 0) {
    findings.push({
      key: "workflow:blocked-improvements",
      title: `${blockedCount} melhoria(s) bloqueada(s) há mais de 2 horas`,
      description: `A Central possui ${blockedCount} melhoria(s) bloqueada(s) sem avanço por pelo menos 2 horas. O agente deve identificar a causa, tentar caminhos alternativos seguros em homologação e solicitar aprovação somente quando necessária.`,
      module: "Central de Melhorias",
      priority: blockedCount >= 5 ? "alta" : "media",
      riskSummary: "Fila parada gera acúmulo operacional e faz melhorias parecerem sem execução.",
      acceptanceCriteria: "Nenhuma melhoria deve permanecer bloqueada sem causa registrada, próxima ação e sinalização de aprovação quando aplicável.",
    });
  }

  const failedAgent = await pool.query(
    `SELECT count(*)::int AS total FROM admin_improvements
      WHERE agent_status IN ('failed','needs_attention')
        AND status NOT IN ('producao_validada','cancelada')
        AND updated_at < now() - interval '30 minutes'`,
  );
  const failedCount = Number(failedAgent.rows[0]?.total ?? 0);
  if (failedCount > 0) {
    findings.push({
      key: "workflow:agent-failures",
      title: `${failedCount} execução(ões) de agente precisam recuperação automática`,
      description: `Foram encontradas ${failedCount} melhorias com execução falha ou exigindo atenção há mais de 30 minutos. A política desejada é tentar fallback seguro antes de deixar a fila parada.`,
      module: "Agentes / Execução",
      priority: failedCount >= 3 ? "alta" : "media",
      riskSummary: "Falhas silenciosas interrompem a esteira de melhoria e exigem intervenção manual.",
      acceptanceCriteria: "Falhas devem gerar retentativa/fallback, evidência da causa e notificação quando dependerem de aprovação humana.",
    });
  }

  return findings;
}

async function auditRuntimeUrls(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const candidates = [
    process.env["PUBLIC_APP_URL"],
    process.env["APP_URL"],
    process.env["API_PUBLIC_URL"],
    process.env["HOMOLOGATION_URL"],
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

  for (const base of candidates) {
    const url = base.replace(/\/$/, "");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const startedAt = Date.now();
      const response = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      const latency = Date.now() - startedAt;

      if (!response.ok || latency > 5000) {
        findings.push({
          key: `runtime:http:${url}`,
          title: `Runtime degradado: ${url}`,
          description: `A auditoria recebeu HTTP ${response.status} com latência de ${latency} ms em ${url}.`,
          module: "Infraestrutura",
          priority: !response.ok ? "alta" : "media",
          riskSummary: "Indisponibilidade ou alta latência pode afetar usuários e automações.",
          acceptanceCriteria: "Endpoint deve responder 2xx/3xx de forma consistente e sem degradação recorrente.",
        });
      }
    } catch (error) {
      findings.push({
        key: `runtime:unreachable:${url}`,
        title: `Runtime inacessível: ${url}`,
        description: `A auditoria automática não conseguiu acessar ${url}: ${error instanceof Error ? error.message : String(error)}`,
        module: "Infraestrutura",
        priority: "urgente",
        riskSummary: "Possível indisponibilidade total ou falha de rede/DNS.",
        acceptanceCriteria: "Endpoint deve estar acessível e responder de forma estável em verificações consecutivas.",
      });
    }
  }
  return findings;
}

async function auditFrontendRoutes(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const base = (process.env["HOMOLOGATION_URL"] || process.env["PUBLIC_APP_URL"] || process.env["APP_URL"] || "").replace(/\/$/, "");
  if (!base) return findings;

  const routes = [
    "/dashboard",
    "/leads",
    "/negocios",
    "/conversas",
    "/agenda",
    "/propostas",
    "/app/prospector",
    "/configuracoes",
    "/admin/melhorias",
  ];

  for (const path of routes) {
    const url = `${base}${path}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const startedAt = Date.now();
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "VendorAI-Continuous-Audit/1.0" },
      });
      clearTimeout(timeout);
      const latency = Date.now() - startedAt;

      if (response.status >= 500 || latency > 5000) {
        findings.push({
          key: `ui-route:${path}:${response.status >= 500 ? "server-error" : "slow"}`,
          title: `Rota degradada: ${path}`,
          description: `A auditoria de UI recebeu HTTP ${response.status} em ${latency} ms ao abrir ${path}. A rota deve ser validada no Browser Agent em desktop e mobile antes da publicação.`,
          module: "UI / UX",
          priority: response.status >= 500 ? "alta" : "media",
          riskSummary: "Rota lenta ou com erro quebra a experiência do tenant e pode esconder regressões visuais/funcionais.",
          acceptanceCriteria: `${path} deve carregar sem 5xx, sem timeout e passar no smoke visual desktop/mobile sem overflow, sobreposição ou loading infinito.`,
        });
      }
    } catch (error) {
      findings.push({
        key: `ui-route:${path}:unreachable`,
        title: `Rota inacessível: ${path}`,
        description: `A auditoria não conseguiu abrir ${url}: ${error instanceof Error ? error.message : String(error)}`,
        module: "UI / UX",
        priority: "alta",
        riskSummary: "A rota pode estar indisponível ou presa em falha de runtime.",
        acceptanceCriteria: `${path} deve responder de forma estável e ser validada pelo Browser Agent em desktop e mobile.`,
      });
    }
  }

  return findings;
}

async function runAudit(log: Logger, mode: "fast" | "deep") {
  if (mode === "deep" && !isNightAuditWindow()) {
    log.debug("continuous-audit: auditoria profunda adiada; janela pesada é 22h-06h BRT");
    return;
  }
  if ((mode === "fast" && fastRunning) || (mode === "deep" && deepRunning)) return;
  if (mode === "fast") fastRunning = true; else deepRunning = true;

  try {
    const batches = await Promise.all([
      auditDatabaseSchema(),
      auditImprovementFlow(),
      ...(mode === "deep" ? [auditRuntimeUrls(), auditFrontendRoutes()] : []),
    ]);
    const findings = batches.flat();
    for (const finding of findings) await upsertFinding(finding, log);
    log.info({ mode, findings: findings.length }, "continuous-audit: ciclo concluído");
  } catch (error) {
    log.error({ err: error, mode }, "continuous-audit: ciclo falhou");
  } finally {
    if (mode === "fast") fastRunning = false; else deepRunning = false;
  }
}

export function startContinuousAuditAgent(log: Logger) {
  if (started) return;
  started = true;

  log.info("continuous-audit: agente 24/7 iniciado (leve 24h, profunda somente 22h-06h BRT, P0/P1 com remediação emergencial imediata)");
  setTimeout(() => { void runAudit(log, "fast"); }, 45_000).unref();
  setTimeout(() => { void runAudit(log, "deep"); }, 2 * 60_000).unref();
  setInterval(() => { void runAudit(log, "fast"); }, FAST_INTERVAL_MS).unref();
  setInterval(() => { void runAudit(log, "deep"); }, DEEP_INTERVAL_MS).unref();
}
