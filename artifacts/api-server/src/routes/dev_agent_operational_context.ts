import { Router } from "express";
import { classifyBackendDrift } from "../lib/dev-agent-deploy-relevance.js";
import { loadEngineeringMemory, recordExecutionMemory } from "./dev_agent_memory";

const router = Router();

type AlertSeverity = "info" | "warning" | "critical";
type EngineeringAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source: "railway" | "github" | "runtime" | "pull_request";
};

type SentinelWatchdog = {
  running: boolean;
  intervalMs: number;
  lastCheckedAt: string | null;
  lastHealthScore: number | null;
  lastCriticalCount: number;
  lastWarningCount: number;
  consecutiveCritical: number;
  lastTransitionAt: string | null;
  lastError: string | null;
};

type DeploymentDrift = {
  backendRelevant: boolean | null;
  changedFiles: string[];
  relevantFiles: string[];
  ignoredFiles: string[];
  reason: string | null;
};

type OperationalContext = {
  observedRevision: string | null;
  mainRevision: string | null;
  productionState: "aligned" | "stale" | "unknown";
  deploymentDrift: DeploymentDrift;
  openDevPrs: Array<{ number: number; title: string; head: string; updatedAt: string }>;
  memoryCount: number;
  healthScore: number;
  alerts: EngineeringAlert[];
  checks: Array<{ context: string; state: string; targetUrl: string | null }>;
  watchdog: SentinelWatchdog;
  checkedAt: string;
};

type SentinelLogger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

const RAILWAY_BACKEND_CONTEXT = "responsible-flow - vendorai-platform-replit";
const SENTINEL_INTERVAL_MS = 5 * 60 * 1000;
let sentinelTimer: NodeJS.Timeout | null = null;
let activeIncidentKey: string | null = null;
let activeIncidentPersisted = false;
let githubUnavailableLogged = false;
let watchdog: SentinelWatchdog = {
  running: false,
  intervalMs: SENTINEL_INTERVAL_MS,
  lastCheckedAt: null,
  lastHealthScore: null,
  lastCriticalCount: 0,
  lastWarningCount: 0,
  consecutiveCritical: 0,
  lastTransitionAt: null,
  lastError: null,
};

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo };
}

async function gh(path: string) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Operational-Context/3.2",
    },
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

function normalizeRevision(value: unknown) {
  const revision = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(revision) ? revision : null;
}

function revisionsMatch(a: string | null, b: string | null) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function emptyDeploymentDrift(): DeploymentDrift {
  return {
    backendRelevant: null,
    changedFiles: [],
    relevantFiles: [],
    ignoredFiles: [],
    reason: null,
  };
}

async function resolveDeploymentDrift(
  owner: string,
  repo: string,
  observedRevision: string | null,
  mainRevision: string | null,
): Promise<DeploymentDrift> {
  if (!observedRevision || !mainRevision) {
    return { ...emptyDeploymentDrift(), reason: "revision_unavailable" };
  }
  if (revisionsMatch(observedRevision, mainRevision)) {
    return {
      backendRelevant: false,
      changedFiles: [],
      relevantFiles: [],
      ignoredFiles: [],
      reason: "runtime_matches_main",
    };
  }

  try {
    const comparison = await gh(`/repos/${owner}/${repo}/compare/${observedRevision}...${mainRevision}`);
    const paths = (Array.isArray(comparison?.files) ? comparison.files : [])
      .map((file: any) => String(file?.filename ?? "").trim())
      .filter(Boolean);
    const classified = classifyBackendDrift(paths);
    return {
      ...classified,
      reason: classified.backendRelevant ? "backend_changes_pending" : "only_non_backend_changes",
    };
  } catch (error) {
    return {
      ...emptyDeploymentDrift(),
      reason: error instanceof Error ? `compare_failed:${error.message}` : "compare_failed",
    };
  }
}

function buildSentinelAlerts(args: {
  observedRevision: string | null;
  mainRevision: string | null;
  deploymentDrift: DeploymentDrift;
  checks: OperationalContext["checks"];
  openDevPrs: OperationalContext["openDevPrs"];
  githubAvailable: boolean;
}) {
  const alerts: EngineeringAlert[] = [];

  if (!args.githubAvailable) {
    alerts.push({
      id: "github-unavailable",
      severity: "warning",
      title: "GitHub indisponível para a Sentinela",
      detail: "Não foi possível confirmar main, checks e PRs nesta leitura.",
      source: "github",
    });
  }

  if (!args.observedRevision) {
    alerts.push({
      id: "runtime-revision-unknown",
      severity: "warning",
      title: "SHA do runtime não identificado",
      detail: "A Sentinela não conseguiu confirmar qual revisão está executando no Railway.",
      source: "runtime",
    });
  } else if (args.mainRevision && !revisionsMatch(args.observedRevision, args.mainRevision)) {
    if (args.deploymentDrift.backendRelevant === true) {
      alerts.push({
        id: "runtime-stale",
        severity: "critical",
        title: "Backend de produção atrás da main",
        detail: `Há ${args.deploymentDrift.relevantFiles.length} arquivo(s) relevante(s) ao backend ainda não presentes no runtime ${args.observedRevision.slice(0, 9)}.`,
        source: "runtime",
      });
    } else if (args.deploymentDrift.backendRelevant === null) {
      alerts.push({
        id: "runtime-drift-unclassified",
        severity: "warning",
        title: "Diferença entre runtime e main ainda não classificada",
        detail: "A Sentinela não conseguiu determinar se as mudanças pendentes exigem deploy do backend.",
        source: "runtime",
      });
    }
  }

  for (const check of args.checks) {
    if (check.context !== RAILWAY_BACKEND_CONTEXT) continue;
    if (check.state === "failure" || check.state === "error") {
      alerts.push({
        id: "railway-failure",
        severity: "critical",
        title: "Gate Railway falhou",
        detail: "O fluxo responsável do backend está em falha na main.",
        source: "railway",
      });
    } else if (check.state === "pending") {
      alerts.push({
        id: "railway-pending",
        severity: "warning",
        title: "Railway ainda processando",
        detail: "O gate/deploy do backend ainda não terminou.",
        source: "railway",
      });
    }
  }

  const now = Date.now();
  for (const pr of args.openDevPrs) {
    const ageMs = now - new Date(pr.updatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) {
      alerts.push({
        id: `pr-${pr.number}-stale`,
        severity: "warning",
        title: `PR Dev IA #${pr.number} parado há mais de 24h`,
        detail: pr.title,
        source: "pull_request",
      });
    }
  }

  return alerts;
}

function calculateHealthScore(alerts: EngineeringAlert[]) {
  const penalty = alerts.reduce((total, alert) => {
    if (alert.severity === "critical") return total + 35;
    if (alert.severity === "warning") return total + 10;
    return total + 2;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function watchdogSnapshot(): SentinelWatchdog {
  return { ...watchdog };
}

function incidentKey(context: OperationalContext) {
  const alertKey = context.alerts
    .filter((alert) => alert.severity === "critical")
    .map((alert) => alert.id)
    .sort()
    .join("-")
    .slice(0, 56);
  return [
    "sentinel",
    context.mainRevision?.slice(0, 12) ?? "main-unknown",
    context.observedRevision?.slice(0, 12) ?? "runtime-unknown",
    alertKey || "critical",
  ].join("-").slice(0, 120);
}

async function persistIncidentMemory(
  context: OperationalContext,
  status: "production_incident" | "production_recovered",
  requestId: string,
  logger: SentinelLogger,
) {
  try {
    const critical = context.alerts.filter((alert) => alert.severity === "critical");
    const evidenceAlerts = (status === "production_recovered" ? context.alerts : critical).slice(0, 6);
    const summary = status === "production_incident"
      ? `Sentinela confirmou incidente de produção após ${watchdog.consecutiveCritical} ciclos críticos consecutivos. Score ${context.healthScore}; estado ${context.productionState}.`
      : `Sentinela confirmou recuperação da produção. Score ${context.healthScore}; estado ${context.productionState}; nenhum sinal crítico permanece.`;

    await recordExecutionMemory({
      requestId,
      route: "/admin/dev-engineering",
      recordedAt: new Date().toISOString(),
      status,
      summary,
      ...(context.mainRevision ? { mergeSha: context.mainRevision } : {}),
      changedFiles: context.deploymentDrift.relevantFiles.slice(0, 20),
      engines: ["production-sentinel"],
      failures: status === "production_incident" ? critical.map((alert) => alert.id).slice(0, 8) : [],
      evidence: [
        `health_score=${context.healthScore}`,
        `production_state=${context.productionState}`,
        `backend_relevant_drift=${String(context.deploymentDrift.backendRelevant)}`,
        context.mainRevision ? `main=${context.mainRevision.slice(0, 12)}` : "main=unknown",
        context.observedRevision ? `runtime=${context.observedRevision.slice(0, 12)}` : "runtime=unknown",
        ...evidenceAlerts.map((alert) => `${alert.source}:${alert.id}:${alert.title}`),
      ].slice(0, 8),
    });
    logger.info({ requestId, status }, "dev-ia sentinel: incident memory persisted");
    return true;
  } catch (error) {
    logger.warn({ err: error, requestId, status }, "dev-ia sentinel: incident memory persistence failed");
    return false;
  }
}

export async function getOperationalContext(): Promise<OperationalContext> {
  const observedRevision = normalizeRevision(
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_DEPLOYMENT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
  );
  let mainRevision: string | null = null;
  let openDevPrs: OperationalContext["openDevPrs"] = [];
  let checks: OperationalContext["checks"] = [];
  let deploymentDrift = emptyDeploymentDrift();
  let memoryCount = 0;
  let githubAvailable = true;

  try {
    const { owner, repo } = githubConfig();
    const main = await gh(`/repos/${owner}/${repo}/commits/main`);
    mainRevision = normalizeRevision(main?.sha);

    const [pulls, status, drift] = await Promise.all([
      gh(`/repos/${owner}/${repo}/pulls?state=open&per_page=50&sort=updated&direction=desc`),
      mainRevision ? gh(`/repos/${owner}/${repo}/commits/${mainRevision}/status`) : Promise.resolve({ statuses: [] }),
      resolveDeploymentDrift(owner, repo, observedRevision, mainRevision),
    ]);

    deploymentDrift = drift;
    openDevPrs = (pulls ?? [])
      .filter((pr: any) => {
        const ref = String(pr?.head?.ref ?? "");
        return ref.startsWith("dev-ia/") || ref.includes("dev-ia");
      })
      .slice(0, 8)
      .map((pr: any) => ({
        number: Number(pr.number),
        title: String(pr.title ?? "").slice(0, 180),
        head: String(pr.head?.ref ?? "").slice(0, 160),
        updatedAt: String(pr.updated_at ?? ""),
      }));

    checks = (Array.isArray(status?.statuses) ? status.statuses : []).map((item: any) => ({
      context: String(item?.context ?? ""),
      state: String(item?.state ?? "pending"),
      targetUrl: item?.target_url ? String(item.target_url) : null,
    }));
  } catch (error) {
    githubAvailable = false;
    const message = error instanceof Error ? error.message : "unknown GitHub error";

    // GitHub integration is optional for the production runtime. When the
    // credential is intentionally absent, keep the sentinel degraded but do
    // not emit the same stderr warning every five minutes. Other GitHub
    // failures remain visible, and a missing-token warning is emitted once
    // per process so operators still have evidence of the degraded state.
    if (message !== "GITHUB_DEV_TOKEN_MISSING" || !githubUnavailableLogged) {
      console.warn("dev-ia sentinel: GitHub context unavailable", { error: message });
      githubUnavailableLogged = true;
    }
  }

  try {
    memoryCount = (await loadEngineeringMemory(25)).length;
  } catch {
    memoryCount = 0;
  }

  let productionState: OperationalContext["productionState"] = "unknown";
  if (observedRevision && mainRevision) {
    if (revisionsMatch(observedRevision, mainRevision) || deploymentDrift.backendRelevant === false) {
      productionState = "aligned";
    } else if (deploymentDrift.backendRelevant === true) {
      productionState = "stale";
    }
  }

  const alerts = buildSentinelAlerts({
    observedRevision,
    mainRevision,
    deploymentDrift,
    checks,
    openDevPrs,
    githubAvailable,
  });

  return {
    observedRevision,
    mainRevision,
    productionState,
    deploymentDrift,
    openDevPrs,
    memoryCount,
    healthScore: calculateHealthScore(alerts),
    alerts,
    checks,
    watchdog: watchdogSnapshot(),
    checkedAt: new Date().toISOString(),
  };
}

async function runSentinelWatchdog(logger: SentinelLogger) {
  try {
    const previousScore = watchdog.lastHealthScore;
    const previousCritical = watchdog.lastCriticalCount;
    const context = await getOperationalContext();
    const criticalCount = context.alerts.filter((alert) => alert.severity === "critical").length;
    const warningCount = context.alerts.filter((alert) => alert.severity === "warning").length;
    const now = new Date().toISOString();
    const changed = previousScore !== context.healthScore || previousCritical !== criticalCount;

    watchdog = {
      ...watchdog,
      running: true,
      lastCheckedAt: now,
      lastHealthScore: context.healthScore,
      lastCriticalCount: criticalCount,
      lastWarningCount: warningCount,
      consecutiveCritical: criticalCount > 0 ? watchdog.consecutiveCritical + 1 : 0,
      lastTransitionAt: changed ? now : watchdog.lastTransitionAt,
      lastError: null,
    };

    const logContext = {
      healthScore: context.healthScore,
      criticalCount,
      warningCount,
      productionState: context.productionState,
      backendRelevantDrift: context.deploymentDrift.backendRelevant,
      relevantFiles: context.deploymentDrift.relevantFiles.length,
      ignoredFiles: context.deploymentDrift.ignoredFiles.length,
      observedRevision: context.observedRevision?.slice(0, 9) ?? null,
      mainRevision: context.mainRevision?.slice(0, 9) ?? null,
      consecutiveCritical: watchdog.consecutiveCritical,
    };

    if (criticalCount > 0) {
      const currentIncidentKey = incidentKey(context);
      if (activeIncidentKey !== currentIncidentKey) {
        activeIncidentKey = currentIncidentKey;
        activeIncidentPersisted = false;
      }
      if (watchdog.consecutiveCritical >= 2 && !activeIncidentPersisted) {
        activeIncidentPersisted = await persistIncidentMemory(context, "production_incident", currentIncidentKey, logger);
      }
      logger.error(logContext, "dev-ia sentinel: critical production signal");
      return;
    }

    if (activeIncidentKey && activeIncidentPersisted) {
      const recovered = await persistIncidentMemory(context, "production_recovered", activeIncidentKey, logger);
      if (recovered) {
        activeIncidentKey = null;
        activeIncidentPersisted = false;
      }
    } else if (activeIncidentKey) {
      activeIncidentKey = null;
      activeIncidentPersisted = false;
    }

    if (warningCount > 0) {
      if (changed) logger.warn(logContext, "dev-ia sentinel: production needs attention");
    } else if (changed || previousScore === null) {
      logger.info(logContext, "dev-ia sentinel: production healthy");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown sentinel error";
    watchdog = {
      ...watchdog,
      running: true,
      lastCheckedAt: new Date().toISOString(),
      lastError: message,
    };
    logger.warn({ err: error }, "dev-ia sentinel: watchdog check failed");
  }
}

export function startProductionSentinel(logger: SentinelLogger) {
  if (sentinelTimer) return;
  watchdog = { ...watchdog, running: true };
  void runSentinelWatchdog(logger);
  sentinelTimer = setInterval(() => {
    void runSentinelWatchdog(logger);
  }, SENTINEL_INTERVAL_MS);
  sentinelTimer.unref();
  logger.info({ intervalMs: SENTINEL_INTERVAL_MS }, "dev-ia sentinel: watchdog started");
}

router.get("/support/dev/operational-context", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode consultar o contexto operacional." });
  }
  try {
    const context = await getOperationalContext();
    return res.json({ success: true, context });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia operational context failed");
    return res.status(500).json({ error: "Falha ao carregar contexto operacional" });
  }
});

export default router;
