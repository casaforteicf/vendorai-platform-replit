import { Router } from "express";
import { loadEngineeringMemory } from "./dev_agent_memory";

const router = Router();

type AlertSeverity = "info" | "warning" | "critical";
type EngineeringAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source: "railway" | "vercel" | "github" | "runtime" | "pull_request";
};

type OperationalContext = {
  observedRevision: string | null;
  mainRevision: string | null;
  productionState: "aligned" | "stale" | "unknown";
  openDevPrs: Array<{ number: number; title: string; head: string; updatedAt: string }>;
  memoryCount: number;
  healthScore: number;
  alerts: EngineeringAlert[];
  checks: Array<{ context: string; state: string; targetUrl: string | null }>;
  checkedAt: string;
};

const REQUIRED_VERCEL_CONTEXTS = new Set([
  "vendorai-platform-replit-frontend",
  "tad-vendorai",
]);

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
      "User-Agent": "VendorAI-Dev-Operational-Context/2.0",
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

function normalizeCheckContext(value: unknown) {
  return String(value ?? "").replace(/^Vercel\s*[–-]\s*/i, "").trim();
}

function buildSentinelAlerts(args: {
  observedRevision: string | null;
  mainRevision: string | null;
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
    alerts.push({
      id: "runtime-stale",
      severity: "critical",
      title: "Produção diferente da main",
      detail: `Runtime ${args.observedRevision.slice(0, 9)} e main ${args.mainRevision.slice(0, 9)} não estão alinhados.`,
      source: "runtime",
    });
  }

  const requiredSeen = new Set<string>();
  for (const check of args.checks) {
    const normalized = normalizeCheckContext(check.context);
    if (REQUIRED_VERCEL_CONTEXTS.has(normalized)) {
      requiredSeen.add(normalized);
      if (check.state === "failure" || check.state === "error") {
        alerts.push({
          id: `vercel-${normalized}-failure`,
          severity: "critical",
          title: `Deploy Vercel falhou: ${normalized}`,
          detail: "O check obrigatório da main está em falha.",
          source: "vercel",
        });
      } else if (check.state === "pending") {
        alerts.push({
          id: `vercel-${normalized}-pending`,
          severity: "warning",
          title: `Deploy Vercel pendente: ${normalized}`,
          detail: "A publicação da main ainda não terminou.",
          source: "vercel",
        });
      }
    }

    if (check.context === "responsible-flow - vendorai-platform-replit") {
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
  }

  if (args.githubAvailable) {
    for (const context of REQUIRED_VERCEL_CONTEXTS) {
      if (!requiredSeen.has(context)) {
        alerts.push({
          id: `vercel-${context}-missing`,
          severity: "warning",
          title: `Check Vercel ausente: ${context}`,
          detail: "A main ainda não publicou evidência desse check obrigatório.",
          source: "vercel",
        });
      }
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

export async function getOperationalContext(): Promise<OperationalContext> {
  const observedRevision = normalizeRevision(
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_DEPLOYMENT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
  );
  let mainRevision: string | null = null;
  let openDevPrs: OperationalContext["openDevPrs"] = [];
  let checks: OperationalContext["checks"] = [];
  let memoryCount = 0;
  let githubAvailable = true;

  try {
    const { owner, repo } = githubConfig();
    const main = await gh(`/repos/${owner}/${repo}/commits/main`);
    mainRevision = normalizeRevision(main?.sha);

    const [pulls, status] = await Promise.all([
      gh(`/repos/${owner}/${repo}/pulls?state=open&per_page=50&sort=updated&direction=desc`),
      mainRevision ? gh(`/repos/${owner}/${repo}/commits/${mainRevision}/status`) : Promise.resolve({ statuses: [] }),
    ]);

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
  } catch {
    githubAvailable = false;
  }

  try {
    memoryCount = (await loadEngineeringMemory(25)).length;
  } catch {
    memoryCount = 0;
  }

  let productionState: OperationalContext["productionState"] = "unknown";
  if (observedRevision && mainRevision) {
    productionState = revisionsMatch(observedRevision, mainRevision) ? "aligned" : "stale";
  }

  const alerts = buildSentinelAlerts({ observedRevision, mainRevision, checks, openDevPrs, githubAvailable });

  return {
    observedRevision,
    mainRevision,
    productionState,
    openDevPrs,
    memoryCount,
    healthScore: calculateHealthScore(alerts),
    alerts,
    checks,
    checkedAt: new Date().toISOString(),
  };
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
