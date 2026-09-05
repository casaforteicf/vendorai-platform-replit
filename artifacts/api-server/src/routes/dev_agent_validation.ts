import { Router } from "express";
import { z } from "zod/v4";

const router = Router();

const validationSchema = z.object({
  expectedRevision: z.string().min(7).max(64).optional(),
});

type ValidationState = "validated" | "stale" | "unknown_revision" | "github_unavailable";

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo };
}

async function getMainRevision() {
  const { token, owner, repo } = githubConfig();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/main`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Validation/1.0",
    },
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  const data = await response.json() as any;
  return String(data?.sha ?? "unknown");
}

function normalizeRevision(value: string | undefined | null) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : "unknown";
}

function revisionsMatch(a: string, b: string) {
  if (a === "unknown" || b === "unknown") return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

router.post("/support/dev/validate-production", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode validar produção pelo Dev IA." });
  }

  const parsed = validationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });

  const observedRevision = normalizeRevision(
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
  );
  const expectedRevision = normalizeRevision(parsed.data.expectedRevision);
  let mainRevision = "unknown";
  let githubAvailable = true;

  try {
    mainRevision = normalizeRevision(await getMainRevision());
  } catch (error) {
    githubAvailable = false;
    req.log?.warn({ err: error }, "dev-ia production validation: main revision unavailable");
  }

  let state: ValidationState = "unknown_revision";
  const expectedMatchesObserved = expectedRevision !== "unknown" && revisionsMatch(expectedRevision, observedRevision);
  const mainMatchesObserved = mainRevision !== "unknown" && revisionsMatch(mainRevision, observedRevision);

  if (observedRevision === "unknown") {
    state = "unknown_revision";
  } else if (expectedRevision !== "unknown") {
    state = expectedMatchesObserved ? "validated" : "stale";
  } else if (!githubAvailable) {
    state = "github_unavailable";
  } else {
    state = mainMatchesObserved ? "validated" : "stale";
  }

  return res.json({
    success: state === "validated",
    state,
    runtime: "railway",
    observedRevision,
    expectedRevision: expectedRevision === "unknown" ? null : expectedRevision,
    mainRevision: mainRevision === "unknown" ? null : mainRevision,
    expectedMatchesObserved,
    mainMatchesObserved,
    githubAvailable,
    uptimeSeconds: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString(),
    evidence: {
      source: "running_api_instance",
      healthContract: "/healthz",
      revisionHeader: "X-VendorAI-Revision",
    },
  });
});

export default router;
