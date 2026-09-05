import { recordExecutionMemory } from "../routes/dev_agent_memory.js";

export type MainGovernanceStatus = "verified_pr" | "direct_commit" | "unknown";

export type MainGovernanceSnapshot = {
  status: MainGovernanceStatus;
  mainRevision: string | null;
  prNumber: number | null;
  consecutiveDirectChecks: number;
  checkedAt: string;
  lastError: string | null;
};

type GovernanceLogger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

const GOVERNANCE_INTERVAL_MS = 5 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let consecutiveDirectChecks = 0;
let activeDirectSha: string | null = null;
let incidentPersisted = false;
let snapshot: MainGovernanceSnapshot = {
  status: "unknown",
  mainRevision: null,
  prNumber: null,
  consecutiveDirectChecks: 0,
  checkedAt: new Date(0).toISOString(),
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
      "User-Agent": "VendorAI-Main-Governance/1.0",
    },
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

function normalizeRevision(value: unknown) {
  const revision = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(revision) ? revision : null;
}

export function evaluateMainGovernance(mainRevision: string | null, associatedPulls: any[]) {
  const revision = normalizeRevision(mainRevision);
  if (!revision) return { status: "unknown" as const, prNumber: null };

  const matched = (Array.isArray(associatedPulls) ? associatedPulls : []).find((pr: any) => {
    const mergeSha = normalizeRevision(pr?.merge_commit_sha);
    return Boolean(pr?.merged_at) && mergeSha === revision;
  });

  if (matched) {
    return { status: "verified_pr" as const, prNumber: Number(matched.number) || null };
  }
  return { status: "direct_commit" as const, prNumber: null };
}

async function persistGovernanceMemory(status: "main_governance_incident" | "main_governance_recovered", sha: string) {
  await recordExecutionMemory({
    requestId: `main-governance-${sha.slice(0, 12)}`,
    route: "/admin/dev-engineering",
    recordedAt: new Date().toISOString(),
    status,
    summary: status === "main_governance_incident"
      ? `Main Governance Guard confirmou commit em main sem PR mergeado após ${consecutiveDirectChecks} ciclos.`
      : "Main Governance Guard confirmou que a main voltou a ter origem em PR mergeado.",
    mergeSha: sha,
    changedFiles: [],
    engines: ["main-governance-guard"],
    failures: status === "main_governance_incident" ? ["main-direct-commit"] : [],
    evidence: [
      `main=${sha.slice(0, 12)}`,
      `consecutive_direct_checks=${consecutiveDirectChecks}`,
    ],
  });
}

export async function checkMainGovernance(): Promise<MainGovernanceSnapshot> {
  try {
    const { owner, repo } = githubConfig();
    const main = await gh(`/repos/${owner}/${repo}/commits/main`);
    const mainRevision = normalizeRevision(main?.sha);
    if (!mainRevision) throw new Error("MAIN_REVISION_UNKNOWN");
    const pulls = await gh(`/repos/${owner}/${repo}/commits/${mainRevision}/pulls`);
    const result = evaluateMainGovernance(mainRevision, pulls);
    snapshot = {
      status: result.status,
      mainRevision,
      prNumber: result.prNumber,
      consecutiveDirectChecks,
      checkedAt: new Date().toISOString(),
      lastError: null,
    };
    return snapshot;
  } catch (error) {
    snapshot = {
      ...snapshot,
      status: "unknown",
      checkedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "unknown governance error",
    };
    return snapshot;
  }
}

async function runGovernanceGuard(logger: GovernanceLogger) {
  const current = await checkMainGovernance();
  const sha = current.mainRevision;

  if (current.status === "direct_commit" && sha) {
    if (activeDirectSha !== sha) {
      activeDirectSha = sha;
      consecutiveDirectChecks = 1;
      incidentPersisted = false;
    } else {
      consecutiveDirectChecks += 1;
    }
    snapshot = { ...current, consecutiveDirectChecks };

    if (consecutiveDirectChecks >= 2 && !incidentPersisted) {
      try {
        await persistGovernanceMemory("main_governance_incident", sha);
        incidentPersisted = true;
      } catch (error) {
        logger.warn({ err: error, sha: sha.slice(0, 12) }, "dev-ia governance: incident memory failed");
      }
    }
    logger.error({ sha: sha.slice(0, 12), consecutiveDirectChecks }, "dev-ia governance: direct commit detected on main");
    return;
  }

  if (current.status === "verified_pr" && sha) {
    if (activeDirectSha && incidentPersisted) {
      try {
        await persistGovernanceMemory("main_governance_recovered", sha);
      } catch (error) {
        logger.warn({ err: error, sha: sha.slice(0, 12) }, "dev-ia governance: recovery memory failed");
      }
    }
    activeDirectSha = null;
    consecutiveDirectChecks = 0;
    incidentPersisted = false;
    snapshot = { ...current, consecutiveDirectChecks: 0 };
    logger.info({ sha: sha.slice(0, 12), prNumber: current.prNumber }, "dev-ia governance: main origin verified by merged PR");
    return;
  }

  logger.warn({ error: current.lastError }, "dev-ia governance: main origin could not be verified");
}

export function getMainGovernanceSnapshot() {
  return { ...snapshot };
}

export function startMainGovernanceGuard(logger: GovernanceLogger) {
  if (timer) return;
  void runGovernanceGuard(logger);
  timer = setInterval(() => { void runGovernanceGuard(logger); }, GOVERNANCE_INTERVAL_MS);
  timer.unref();
  logger.info({ intervalMs: GOVERNANCE_INTERVAL_MS }, "dev-ia governance: guard started");
}
