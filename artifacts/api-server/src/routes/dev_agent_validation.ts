import { Router } from "express";
import { z } from "zod/v4";

const router = Router();

const validationSchema = z.object({
  expectedRevision: z.string().min(7).max(64).optional(),
});

type ValidationState =
  | "validated"
  | "stale"
  | "unknown_revision"
  | "github_unavailable"
  | "vercel_pending"
  | "frontend_unreachable";

type Runtime = "railway" | "vercel";

export type ProductionValidationResult = {
  success: boolean;
  state: ValidationState;
  runtime: Runtime;
  observedRevision: string;
  expectedRevision: string | null;
  mainRevision: string | null;
  githubAvailable: boolean;
  checkedAt: string;
  evidence: Record<string, any>;
  expectedIncludedInMain?: boolean;
  expectedMatchesObserved?: boolean;
  expectedIncludedInObserved?: boolean;
  mainMatchesObserved?: boolean;
  uptimeSeconds?: number;
};

const BACKEND_PATH_PATTERNS = [
  /^artifacts\/api-server\//i,
  /^lib\/db\//i,
  /^backend\//i,
];

const REQUIRED_VERCEL_CONTEXTS = new Set([
  "vendorai-platform-replit-frontend",
  "tad-vendorai",
]);

const OPTIONAL_VERCEL_CONTEXTS = new Set([
  "vendorai-platform-replit-website",
]);

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo };
}

async function githubJson(path: string) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Validation/2.1",
    },
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

async function getMainRevision() {
  const { owner, repo } = githubConfig();
  const data = await githubJson(`/repos/${owner}/${repo}/commits/main`);
  return String(data?.sha ?? "unknown");
}

async function getCommitEvidence(revision: string) {
  const { owner, repo } = githubConfig();
  const [commit, status] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(revision)}`),
    githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(revision)}/status`),
  ]);
  const changedFiles = Array.isArray(commit?.files)
    ? commit.files.map((file: any) => String(file?.filename ?? "")).filter(Boolean)
    : [];
  const backendTouched = changedFiles.some((file: string) => BACKEND_PATH_PATTERNS.some((pattern) => pattern.test(file)));
  return {
    changedFiles,
    backendTouched,
    statuses: Array.isArray(status?.statuses) ? status.statuses : [],
  };
}

async function revisionIsIncluded(baseRevision: string, headRevision: string) {
  if (revisionsMatch(baseRevision, headRevision)) return true;
  try {
    const { owner, repo } = githubConfig();
    const comparison = await githubJson(
      `/repos/${owner}/${repo}/compare/${encodeURIComponent(baseRevision)}...${encodeURIComponent(headRevision)}`,
    );
    return comparison?.status === "ahead" || comparison?.status === "identical";
  } catch {
    return false;
  }
}

function normalizeRevision(value: string | undefined | null) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : "unknown";
}

function revisionsMatch(a: string, b: string) {
  if (a === "unknown" || b === "unknown") return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function normalizeVercelContext(value: unknown) {
  return String(value ?? "").replace(/^Vercel\s*[–-]\s*/i, "").trim();
}

function evaluateVercel(statuses: any[]) {
  const normalized = statuses.map((item: any) => ({
    context: normalizeVercelContext(item?.context),
    rawContext: String(item?.context ?? ""),
    state: String(item?.state ?? "pending"),
    targetUrl: item?.target_url ?? null,
  }));
  const relevant = normalized.filter(
    (item) => REQUIRED_VERCEL_CONTEXTS.has(item.context) || OPTIONAL_VERCEL_CONTEXTS.has(item.context),
  );
  const required = relevant.filter((item) => REQUIRED_VERCEL_CONTEXTS.has(item.context));
  const requiredContexts = new Set(required.map((item) => item.context));
  const missingRequired = [...REQUIRED_VERCEL_CONTEXTS].filter((context) => !requiredContexts.has(context));
  const blocking = required.filter((item) => item.state !== "success");
  return {
    success: missingRequired.length === 0 && blocking.length === 0,
    relevant,
    required,
    blocking,
    missingRequired,
  };
}

async function checkFrontendReachability() {
  const url = process.env["VENDORAI_FRONTEND_URL"] ?? "https://app.appvendorai.com";
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "VendorAI-Dev-Validation/2.1" },
    });
    return { url, reachable: response.status >= 200 && response.status < 400, status: response.status };
  } catch (error) {
    return {
      url,
      reachable: false,
      status: null,
      error: error instanceof Error ? error.message : "frontend unavailable",
    };
  }
}

export async function validateProductionRevision(expectedRevisionInput?: string | null): Promise<ProductionValidationResult> {
  const expectedRevision = normalizeRevision(expectedRevisionInput);
  let mainRevision = "unknown";
  let githubAvailable = true;
  let commitEvidence: Awaited<ReturnType<typeof getCommitEvidence>> | null = null;

  try {
    mainRevision = normalizeRevision(await getMainRevision());
    if (expectedRevision !== "unknown") commitEvidence = await getCommitEvidence(expectedRevision);
  } catch {
    githubAvailable = false;
  }

  const runtime: Runtime = expectedRevision !== "unknown" && commitEvidence && !commitEvidence.backendTouched
    ? "vercel"
    : "railway";

  if (runtime === "vercel" && expectedRevision !== "unknown" && commitEvidence) {
    const vercel = evaluateVercel(commitEvidence.statuses);
    const frontend = await checkFrontendReachability();
    const expectedIncludedInMain = mainRevision !== "unknown"
      ? await revisionIsIncluded(expectedRevision, mainRevision)
      : false;

    let state: ValidationState = "vercel_pending";
    if (!githubAvailable) state = "github_unavailable";
    else if (!expectedIncludedInMain) state = "stale";
    else if (!vercel.success) state = "vercel_pending";
    else if (!frontend.reachable) state = "frontend_unreachable";
    else state = "validated";

    return {
      success: state === "validated",
      state,
      runtime,
      observedRevision: expectedRevision,
      expectedRevision,
      mainRevision: mainRevision === "unknown" ? null : mainRevision,
      expectedIncludedInMain,
      githubAvailable,
      checkedAt: new Date().toISOString(),
      evidence: {
        source: "github_vercel_status_and_live_frontend",
        changedFiles: commitEvidence.changedFiles,
        vercel,
        frontend,
      },
    };
  }

  const observedRevision = normalizeRevision(
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_DEPLOYMENT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
  );

  let state: ValidationState = "unknown_revision";
  const expectedMatchesObserved = expectedRevision !== "unknown" && revisionsMatch(expectedRevision, observedRevision);
  const expectedIncludedInObserved = expectedRevision !== "unknown" && observedRevision !== "unknown"
    ? await revisionIsIncluded(expectedRevision, observedRevision)
    : false;
  const mainMatchesObserved = mainRevision !== "unknown" && revisionsMatch(mainRevision, observedRevision);

  if (observedRevision === "unknown") {
    state = "unknown_revision";
  } else if (expectedRevision !== "unknown") {
    state = expectedIncludedInObserved ? "validated" : "stale";
  } else if (!githubAvailable) {
    state = "github_unavailable";
  } else {
    state = mainMatchesObserved ? "validated" : "stale";
  }

  return {
    success: state === "validated",
    state,
    runtime,
    observedRevision,
    expectedRevision: expectedRevision === "unknown" ? null : expectedRevision,
    mainRevision: mainRevision === "unknown" ? null : mainRevision,
    expectedMatchesObserved,
    expectedIncludedInObserved,
    mainMatchesObserved,
    githubAvailable,
    uptimeSeconds: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString(),
    evidence: {
      source: "running_api_instance",
      healthContract: "/healthz",
      revisionHeader: "X-VendorAI-Revision",
      changedFiles: commitEvidence?.changedFiles ?? [],
      backendGate: "ci:railway",
    },
  };
}

router.post("/support/dev/validate-production", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode validar produção pelo Dev IA." });
  }

  const parsed = validationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });

  try {
    const result = await validateProductionRevision(parsed.data.expectedRevision);
    if (!result.githubAvailable) req.log?.warn("dev-ia production validation: GitHub evidence unavailable");
    return res.json(result);
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia production validation failed");
    return res.status(500).json({ error: "Falha ao validar produção pelo Dev IA" });
  }
});

export default router;