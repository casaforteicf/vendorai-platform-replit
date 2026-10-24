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
  | "frontend_unreachable";

type Runtime = "railway" | "contabo" | "cloudflare";

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
      "User-Agent": "VendorAI-Dev-Validation/3.0",
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
  const commit = await githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(revision)}`);
  const changedFiles = Array.isArray(commit?.files)
    ? commit.files.map((file: any) => String(file?.filename ?? "")).filter(Boolean)
    : [];
  return { changedFiles };
}

function normalizeRevision(value: string | undefined | null) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : "unknown";
}

function revisionsMatch(a: string, b: string) {
  if (a === "unknown" || b === "unknown") return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function resolveProductionRuntime(input: {
  changedFiles: string[];
  backendRuntime?: string | null;
}): Runtime {
  const backendTouched = input.changedFiles.some((file) =>
    BACKEND_PATH_PATTERNS.some((pattern) => pattern.test(file)),
  );
  if (!backendTouched) return "cloudflare";
  return String(input.backendRuntime ?? "").trim().toLowerCase() === "contabo"
    ? "contabo"
    : "railway";
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

async function checkCloudflareFrontend(expectedRevision: string) {
  const url = process.env["VENDORAI_FRONTEND_URL"] ?? "https://app.appvendorai.com";
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/?__vendorai_validation=${Date.now()}`, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "VendorAI-Dev-Validation/3.0",
        "Cache-Control": "no-cache",
      },
    });
    const html = await response.text();
    const revisionPrefix = expectedRevision === "unknown" ? null : expectedRevision.slice(0, 12);
    const deployedRevision = revisionPrefix && html.includes(`-${revisionPrefix}-`) ? expectedRevision : "unknown";
    return {
      url,
      reachable: response.status >= 200 && response.status < 400,
      status: response.status,
      deployedRevision,
      revisionPrefix,
      matchesExpected: revisionPrefix ? html.includes(`-${revisionPrefix}-`) : false,
      provider: "cloudflare_pages",
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      status: null,
      deployedRevision: "unknown",
      revisionPrefix: expectedRevision === "unknown" ? null : expectedRevision.slice(0, 12),
      matchesExpected: false,
      provider: "cloudflare_pages",
      error: error instanceof Error ? error.message : "frontend unavailable",
    };
  }
}

async function checkContaboBackend(expectedRevision: string) {
  const configuredUrl = process.env["VENDORAI_PRODUCTION_API_URL"]?.trim();
  if (!configuredUrl) {
    return {
      url: null,
      reachable: false,
      status: null,
      observedRevision: "unknown",
      matchesExpected: false,
      provider: "contabo",
      error: "VENDORAI_PRODUCTION_API_URL_MISSING",
    };
  }

  let healthUrl: URL;
  try {
    healthUrl = new URL("/api/auth/healthz", configuredUrl);
    if (healthUrl.protocol !== "https:") throw new Error("https_required");
  } catch {
    return {
      url: null,
      reachable: false,
      status: null,
      observedRevision: "unknown",
      matchesExpected: false,
      provider: "contabo",
      error: "VENDORAI_PRODUCTION_API_URL_INVALID",
    };
  }

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { "Cache-Control": "no-cache", "User-Agent": "VendorAI-Dev-Validation/3.0" },
    });
    const payload = await response.json().catch(() => null) as { status?: unknown } | null;
    const observedRevision = normalizeRevision(response.headers.get("x-vendorai-revision"));
    const expectedPrefix = normalizeRevision(expectedRevision);
    return {
      url: healthUrl.toString(),
      reachable: response.ok && payload?.status === "ok",
      status: response.status,
      observedRevision,
      matchesExpected: revisionsMatch(expectedPrefix, observedRevision),
      provider: "contabo",
    };
  } catch (error) {
    return {
      url: healthUrl.toString(),
      reachable: false,
      status: null,
      observedRevision: "unknown",
      matchesExpected: false,
      provider: "contabo",
      error: error instanceof Error ? error.message.slice(0, 240) : "backend_unavailable",
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

  const runtime = expectedRevision !== "unknown" && commitEvidence
    ? resolveProductionRuntime({
        changedFiles: commitEvidence.changedFiles,
        backendRuntime: process.env["VENDORAI_BACKEND_RUNTIME"],
      })
    : "railway";

  if (runtime === "contabo") {
    const backend = await checkContaboBackend(expectedRevision);
    const expectedIncludedInMain = mainRevision !== "unknown"
      ? await revisionIsIncluded(expectedRevision, mainRevision)
      : false;
    const expectedIncludedInObserved = backend.observedRevision !== "unknown"
      ? await revisionIsIncluded(expectedRevision, backend.observedRevision)
      : false;

    let state: ValidationState = "stale";
    if (!githubAvailable) state = "github_unavailable";
    else if (!backend.reachable || backend.observedRevision === "unknown") state = "unknown_revision";
    else if (!expectedIncludedInMain || !expectedIncludedInObserved) state = "stale";
    else if (backend.matchesExpected) state = "validated";

    return {
      success: state === "validated",
      state,
      runtime,
      observedRevision: backend.observedRevision,
      expectedRevision,
      mainRevision: mainRevision === "unknown" ? null : mainRevision,
      githubAvailable,
      checkedAt: new Date().toISOString(),
      expectedIncludedInMain,
      expectedIncludedInObserved,
      expectedMatchesObserved: backend.matchesExpected,
      evidence: {
        source: "contabo_api_health_revision",
        deployment: "Contabo",
        changedFiles: commitEvidence?.changedFiles ?? [],
        backend,
      },
    };
  }

  if (runtime === "cloudflare") {
    const frontend = await checkCloudflareFrontend(expectedRevision);
    const expectedIncludedInMain = mainRevision !== "unknown"
      ? await revisionIsIncluded(expectedRevision, mainRevision)
      : false;

    let state: ValidationState = "stale";
    if (!githubAvailable) state = "github_unavailable";
    else if (!frontend.reachable) state = "frontend_unreachable";
    else if (!expectedIncludedInMain) state = "stale";
    else if (frontend.matchesExpected) state = "validated";

    return {
      success: state === "validated",
      state,
      runtime,
      observedRevision: frontend.deployedRevision,
      expectedRevision,
      mainRevision: mainRevision === "unknown" ? null : mainRevision,
      expectedIncludedInMain,
      githubAvailable,
      checkedAt: new Date().toISOString(),
      evidence: {
        source: "cloudflare_pages_live_bundle",
        deployment: "Cloudflare Pages",
        changedFiles: commitEvidence?.changedFiles ?? [],
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
      deployment: "Railway",
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
