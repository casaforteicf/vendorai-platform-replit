export type DevAgentCheckEvidenceItem = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  app: string;
  detailsUrl: string | null;
  executedSteps: number | null;
};

export type DevAgentRegressionTestEvidence = {
  required: boolean;
  conventionDetected: boolean;
  satisfied: boolean;
  productionFiles: string[];
  changedTestFiles: string[];
  nearbyTestFiles: string[];
  checkedDirectories: string[];
};

export type RegressionTestContractInput = {
  productionFiles: string[];
  changedTestFiles: string[];
  directoriesWithConvention: string[];
};

export type RegressionTestContractDecision = {
  required: boolean;
  conventionDetected: boolean;
  satisfied: boolean;
};

export type DevAgentCheckEvidence = {
  available: boolean;
  total: number;
  successes: DevAgentCheckEvidenceItem[];
  codeFailures: DevAgentCheckEvidenceItem[];
  infrastructureFailures: DevAgentCheckEvidenceItem[];
  externalFailures: DevAgentCheckEvidenceItem[];
  pending: DevAgentCheckEvidenceItem[];
  regressionTestEvidence: DevAgentRegressionTestEvidence;
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
      "User-Agent": "VendorAI-Dev-Check-Evidence/1.2",
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

const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs))$/i;
const TESTABLE_CODE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

function isTestFile(path: string) {
  return TEST_FILE_PATTERN.test(path);
}

function isTestableProductionFile(path: string) {
  if (!TESTABLE_CODE_PATTERN.test(path) || isTestFile(path)) return false;
  if (/\.d\.ts$/i.test(path) || /\.(?:stories|config)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(path)) return false;
  if (/(?:^|\/)(?:generated|dist|build|scripts?)\//i.test(path)) return false;
  return /^(?:artifacts\/(?:api-server|frontend)\/src\/|lib\/)/i.test(path);
}

function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "";
}

export function evaluateRegressionTestContract(input: RegressionTestContractInput): RegressionTestContractDecision {
  const directoriesWithConvention = new Set(input.directoriesWithConvention.filter(Boolean));
  const conventionDetected = directoriesWithConvention.size > 0;
  const required = input.productionFiles.length > 0 && conventionDetected;
  const changedTestInConvention = input.changedTestFiles.some((path) => {
    const testDirectory = dirname(path);
    return directoriesWithConvention.has(testDirectory) || directoriesWithConvention.has(dirname(testDirectory));
  });

  return {
    required,
    conventionDetected,
    satisfied: !required || changedTestInConvention,
  };
}

async function testsInDirectory(path: string) {
  if (!path) return [] as string[];
  const { owner, repo } = githubConfig();
  const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  try {
    const items = await githubJson(`/repos/${owner}/${repo}/contents/${encoded}?ref=main`);
    if (!Array.isArray(items)) return [];
    const tests = items
      .filter((item: any) => item?.type === "file" && isTestFile(String(item?.path ?? "")))
      .map((item: any) => String(item.path));
    const testDirs = items.filter((item: any) => item?.type === "dir" && String(item?.name ?? "") === "__tests__").slice(0, 1);
    for (const testDir of testDirs) {
      try {
        const nestedPath = String(testDir.path ?? "");
        const nestedEncoded = encodeURIComponent(nestedPath).replace(/%2F/g, "/");
        const nested = await githubJson(`/repos/${owner}/${repo}/contents/${nestedEncoded}?ref=main`);
        if (Array.isArray(nested)) {
          tests.push(...nested.filter((item: any) => item?.type === "file" && isTestFile(String(item?.path ?? ""))).map((item: any) => String(item.path)));
        }
      } catch {
        // Convenção não comprovada: falha segura sem inventar obrigação.
      }
    }
    return Array.from(new Set(tests)).slice(0, 20);
  } catch {
    return [];
  }
}

async function collectRegressionTestEvidence(headSha: string): Promise<DevAgentRegressionTestEvidence> {
  const { owner, repo } = githubConfig();
  const pulls = await githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(headSha)}/pulls?per_page=10`).catch(() => []);
  const pull = Array.isArray(pulls) ? pulls.find((item: any) => String(item?.head?.sha ?? "") === headSha) ?? pulls[0] : null;
  if (!pull?.number) {
    return { required: false, conventionDetected: false, satisfied: true, productionFiles: [], changedTestFiles: [], nearbyTestFiles: [], checkedDirectories: [] };
  }

  const files = await githubJson(`/repos/${owner}/${repo}/pulls/${Number(pull.number)}/files?per_page=100`);
  const changedPaths = Array.isArray(files) ? files.map((file: any) => String(file?.filename ?? "")).filter(Boolean) : [];
  const productionFiles = changedPaths.filter(isTestableProductionFile).slice(0, 30);
  const changedTestFiles = changedPaths.filter(isTestFile).slice(0, 30);
  const checkedDirectories = Array.from(new Set(productionFiles.map(dirname).filter(Boolean))).slice(0, 8);

  const nearbyTestFiles: string[] = [];
  const directoriesWithConvention = new Set<string>();
  for (const directory of checkedDirectories) {
    const tests = await testsInDirectory(directory);
    if (tests.length) directoriesWithConvention.add(directory);
    nearbyTestFiles.push(...tests);
  }

  const decision = evaluateRegressionTestContract({
    productionFiles,
    changedTestFiles,
    directoriesWithConvention: [...directoriesWithConvention],
  });

  return {
    ...decision,
    productionFiles,
    changedTestFiles,
    nearbyTestFiles: Array.from(new Set(nearbyTestFiles)).slice(0, 30),
    checkedDirectories,
  };
}

const NEGATIVE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);

export async function collectDevAgentCheckEvidence(headSha: string): Promise<DevAgentCheckEvidence> {
  const { owner, repo } = githubConfig();
  const sha = String(headSha ?? "").trim();
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) throw new Error("HEAD_SHA_INVALID");

  const [data, regressionTestEvidence] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`),
    collectRegressionTestEvidence(sha),
  ]);
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

  if (!regressionTestEvidence.satisfied) {
    codeFailures.push({
      id: -1,
      name: "regression-test-contract",
      status: "completed",
      conclusion: "failure",
      app: "vendorai-dev-policy",
      detailsUrl: null,
      executedSteps: 1,
    });
  } else if (regressionTestEvidence.required) {
    successes.push({
      id: -2,
      name: "regression-test-contract",
      status: "completed",
      conclusion: "success",
      app: "vendorai-dev-policy",
      detailsUrl: null,
      executedSteps: 1,
    });
  }

  return {
    available: true,
    total: runs.length + (regressionTestEvidence.required ? 1 : 0),
    successes: successes.slice(0, 20),
    codeFailures: codeFailures.slice(0, 12),
    infrastructureFailures: infrastructureFailures.slice(0, 12),
    externalFailures: externalFailures.slice(0, 12),
    pending: pending.slice(0, 20),
    regressionTestEvidence,
    checkedAt: new Date().toISOString(),
  };
}
