export type DevAgentCheckEvidenceItem = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  app: string;
  detailsUrl: string | null;
  executedSteps: number | null;
};

export type DevAgentCheckEvidence = {
  available: boolean;
  total: number;
  successes: DevAgentCheckEvidenceItem[];
  codeFailures: DevAgentCheckEvidenceItem[];
  infrastructureFailures: DevAgentCheckEvidenceItem[];
  externalFailures: DevAgentCheckEvidenceItem[];
  pending: DevAgentCheckEvidenceItem[];
  checkedAt: string;
};

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
      "User-Agent": "VendorAI-Dev-Check-Evidence/1.0",
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

function normalizeRun(run: any, executedSteps: number | null): DevAgentCheckEvidenceItem {
  return {
    id: Number(run?.id ?? 0),
    name: String(run?.name ?? "check").slice(0, 200),
    status: String(run?.status ?? "unknown").slice(0, 40),
    conclusion: run?.conclusion ? String(run.conclusion).slice(0, 40) : null,
    app: String(run?.app?.slug ?? run?.app?.name ?? "unknown").slice(0, 80),
    detailsUrl: run?.details_url ? String(run.details_url).slice(0, 500) : null,
    executedSteps,
  };
}

async function executedGithubActionSteps(run: any) {
  if (String(run?.app?.slug ?? "") !== "github-actions") return null;
  const id = Number(run?.id ?? 0);
  if (!id) return 0;
  try {
    const job = await githubJson(`/repos/${githubConfig().owner}/${githubConfig().repo}/actions/jobs/${id}`);
    return Array.isArray(job?.steps) ? job.steps.length : 0;
  } catch {
    return 0;
  }
}

const NEGATIVE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);

export async function collectDevAgentCheckEvidence(headSha: string): Promise<DevAgentCheckEvidence> {
  const { owner, repo } = githubConfig();
  const sha = String(headSha ?? "").trim();
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) throw new Error("HEAD_SHA_INVALID");

  const data = await githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`);
  const runs = Array.isArray(data?.check_runs) ? data.check_runs.slice(0, 50) : [];

  const successes: DevAgentCheckEvidenceItem[] = [];
  const codeFailures: DevAgentCheckEvidenceItem[] = [];
  const infrastructureFailures: DevAgentCheckEvidenceItem[] = [];
  const externalFailures: DevAgentCheckEvidenceItem[] = [];
  const pending: DevAgentCheckEvidenceItem[] = [];

  for (const run of runs) {
    const status = String(run?.status ?? "unknown");
    const conclusion = run?.conclusion ? String(run.conclusion) : null;

    if (status !== "completed") {
      pending.push(normalizeRun(run, null));
      continue;
    }

    if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") {
      successes.push(normalizeRun(run, null));
      continue;
    }

    if (!NEGATIVE_CONCLUSIONS.has(String(conclusion ?? ""))) {
      pending.push(normalizeRun(run, null));
      continue;
    }

    if (String(run?.app?.slug ?? "") === "github-actions") {
      const executedSteps = await executedGithubActionSteps(run);
      const item = normalizeRun(run, executedSteps);
      if ((executedSteps ?? 0) > 0) codeFailures.push(item);
      else infrastructureFailures.push(item);
      continue;
    }

    externalFailures.push(normalizeRun(run, null));
  }

  return {
    available: true,
    total: runs.length,
    successes: successes.slice(0, 20),
    codeFailures: codeFailures.slice(0, 12),
    infrastructureFailures: infrastructureFailures.slice(0, 12),
    externalFailures: externalFailures.slice(0, 12),
    pending: pending.slice(0, 20),
    checkedAt: new Date().toISOString(),
  };
}
