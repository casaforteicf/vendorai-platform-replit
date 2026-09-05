import { Router } from "express";
import { z } from "zod/v4";

const router = Router();
const MEMORY_ISSUE_TITLE = "[Dev IA] Memória de Engenharia";
const MEMORY_MARKER = "DEV_IA_MEMORY_V1";
const EXECUTION_MARKER = "DEV_IA_EXECUTION_V1";

export type EngineeringMemoryEntry = {
  requestId: string;
  route: string;
  recordedAt: string;
  primary: string;
  consulted: string[];
  consensus: string;
  conflicts: string[];
  validation: string[];
  confidence: number;
};

export type ExecutionMemoryEntry = {
  requestId: string;
  route: string;
  recordedAt: string;
  status: string;
  summary: string;
  pullRequestNumber?: number;
  mergeSha?: string;
  changedFiles: string[];
  engines: string[];
  failures: string[];
  evidence: string[];
};

export type DevQualityMetrics = {
  executions: number;
  validated: number;
  failed: number;
  rolledBack: number;
  pending: number;
  validationRate: number;
  failureRate: number;
  rollbackRate: number;
  qualityScore: number;
  provenPlaybooks: number;
  lastEvaluatedAt: string;
};

export type DevModuleProfile = {
  module: string;
  executions: number;
  validated: number;
  failed: number;
  rolledBack: number;
  pending: number;
  qualityScore: number;
  provenPlaybooks: number;
  lastSeenAt: string;
  topFiles: string[];
};

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo };
}

async function gh(path: string, init?: RequestInit) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Memory/2.1",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

async function findMemoryIssue() {
  const { owner, repo } = githubConfig();
  const issues = await gh(`/repos/${owner}/${repo}/issues?state=open&per_page=100&sort=created&direction=asc`);
  return (issues ?? []).find((issue: any) => !issue.pull_request && issue.title === MEMORY_ISSUE_TITLE) ?? null;
}

async function ensureMemoryIssue() {
  const existing = await findMemoryIssue();
  if (existing) return existing;
  const { owner, repo } = githubConfig();
  return gh(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: MEMORY_ISSUE_TITLE,
      body: [
        "Ledger interno e persistente do Dev IA.",
        "",
        "Guarda somente resumos técnicos estruturados e resultados de execução; não armazena prompts brutos, tokens, credenciais ou segredos.",
        "Os registros são usados como memória de decisões anteriores e evidência operacional para futuras investigações.",
      ].join("\n"),
    }),
  });
}

function parseMemoryComment(body: unknown): EngineeringMemoryEntry | null {
  if (typeof body !== "string" || !body.startsWith(`${MEMORY_MARKER}\n`)) return null;
  try {
    const parsed = JSON.parse(body.slice(MEMORY_MARKER.length + 1));
    if (!parsed?.requestId || !parsed?.recordedAt) return null;
    return {
      requestId: String(parsed.requestId).slice(0, 120),
      route: String(parsed.route ?? "/").slice(0, 500),
      recordedAt: String(parsed.recordedAt),
      primary: String(parsed.primary ?? "unknown").slice(0, 80),
      consulted: Array.isArray(parsed.consulted) ? parsed.consulted.slice(0, 5).map(String) : [],
      consensus: String(parsed.consensus ?? "").slice(0, 3000),
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.slice(0, 8).map((v: unknown) => String(v).slice(0, 900)) : [],
      validation: Array.isArray(parsed.validation) ? parsed.validation.slice(0, 8).map((v: unknown) => String(v).slice(0, 500)) : [],
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    };
  } catch {
    return null;
  }
}

function parseExecutionComment(body: unknown): ExecutionMemoryEntry | null {
  if (typeof body !== "string" || !body.startsWith(`${EXECUTION_MARKER}\n`)) return null;
  try {
    const parsed = JSON.parse(body.slice(EXECUTION_MARKER.length + 1));
    if (!parsed?.requestId || !parsed?.recordedAt) return null;
    const pullRequestNumber = Number(parsed.pullRequestNumber);
    const mergeSha = String(parsed.mergeSha ?? "").trim();
    return {
      requestId: String(parsed.requestId).slice(0, 120),
      route: String(parsed.route ?? "/").slice(0, 500),
      recordedAt: String(parsed.recordedAt),
      status: String(parsed.status ?? "unknown").slice(0, 60),
      summary: String(parsed.summary ?? "").slice(0, 1200),
      ...(Number.isInteger(pullRequestNumber) && pullRequestNumber > 0 ? { pullRequestNumber } : {}),
      ...(mergeSha ? { mergeSha: mergeSha.slice(0, 64) } : {}),
      changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles.slice(0, 20).map((v: unknown) => String(v).slice(0, 300)) : [],
      engines: Array.isArray(parsed.engines) ? parsed.engines.slice(0, 5).map((v: unknown) => String(v).slice(0, 80)) : [],
      failures: Array.isArray(parsed.failures) ? parsed.failures.slice(0, 8).map((v: unknown) => String(v).slice(0, 500)) : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 8).map((v: unknown) => String(v).slice(0, 500)) : [],
    };
  } catch {
    return null;
  }
}

async function loadMemoryComments() {
  const issue = await findMemoryIssue();
  if (!issue) return [];
  const { owner, repo } = githubConfig();
  const comments = await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments?per_page=100`);
  return Array.isArray(comments) ? comments : [];
}

export async function loadEngineeringMemory(limit = 12): Promise<EngineeringMemoryEntry[]> {
  const comments = await loadMemoryComments();
  return comments
    .map((comment: any) => parseMemoryComment(comment.body))
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(25, limit))) as EngineeringMemoryEntry[];
}

export async function loadExecutionMemory(limit = 12): Promise<ExecutionMemoryEntry[]> {
  const comments = await loadMemoryComments();
  return comments
    .map((comment: any) => parseExecutionComment(comment.body))
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(25, limit))) as ExecutionMemoryEntry[];
}

export function isSystemExecutionMemory(entry: ExecutionMemoryEntry) {
  const status = entry.status.toLowerCase();
  const engines = entry.engines.map((engine) => engine.toLowerCase());
  return status.includes("incident") || status.includes("recovered") || engines.some((engine) => engine.includes("sentinel") || engine.includes("server-runtime"));
}

export function isProvenExecutionOutcome(entry: ExecutionMemoryEntry) {
  if (isSystemExecutionMemory(entry)) return false;
  const status = entry.status.toLowerCase();
  return /production_validated|deploy_validated|validated_success|production_success/.test(status)
    && entry.changedFiles.length > 0
    && entry.failures.length === 0;
}

function executionOutcome(entry: ExecutionMemoryEntry): "validated" | "failed" | "rolled_back" | "pending" {
  const status = entry.status.toLowerCase();
  if (/rollback|rolled_back|reverted|revert/.test(status)) return "rolled_back";
  if (/failed|failure|error|blocked|step_limit|unreachable/.test(status)) return "failed";
  if (isProvenExecutionOutcome(entry)) return "validated";
  return "pending";
}

function normalizeRouteModule(route: string) {
  const clean = route.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!clean) return "platform/root";
  const parts = clean.split("/").filter(Boolean).filter((part) => part !== "api" && part !== "support");
  if (!parts.length) return "platform/root";
  if (parts[0] === "admin" && parts[1]) return `admin/${parts[1]}`;
  return parts.slice(0, 2).join("/");
}

function inferFileModule(files: string[]) {
  for (const path of files) {
    const normalized = path.toLowerCase();
    const pageMatch = normalized.match(/artifacts\/frontend\/src\/pages\/([^/.]+)/);
    if (pageMatch?.[1]) return `frontend/${pageMatch[1]}`;
    const routeMatch = normalized.match(/artifacts\/api-server\/src\/routes\/([^/.]+)/);
    if (routeMatch?.[1]) return `backend/${routeMatch[1].replace(/^dev_agent_/, "dev-ia-")}`;
  }
  return null;
}

export function executionModuleKey(entry: ExecutionMemoryEntry) {
  const routeModule = normalizeRouteModule(entry.route);
  if (routeModule !== "platform/root") return routeModule;
  return inferFileModule(entry.changedFiles) ?? routeModule;
}

function latestExecutionPerRequest(memory: ExecutionMemoryEntry[]) {
  const grouped = new Map<string, ExecutionMemoryEntry[]>();
  for (const entry of memory.filter((item) => !isSystemExecutionMemory(item))) {
    const list = grouped.get(entry.requestId) ?? [];
    list.push(entry);
    grouped.set(entry.requestId, list);
  }
  return [...grouped.values()].map((entries) => {
    const sorted = [...entries].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const proven = entries.find(isProvenExecutionOutcome);
    const rollback = entries.find((entry) => executionOutcome(entry) === "rolled_back");
    const failure = entries.find((entry) => executionOutcome(entry) === "failed");
    if (rollback) return rollback;
    if (proven) return proven;
    if (failure) return failure;
    return sorted[0];
  });
}

function scoreFromCounts(validated: number, failed: number, rolledBack: number, pending: number) {
  const total = validated + failed + rolledBack + pending;
  if (!total) return 100;
  const weighted = validated * 100 + pending * 55 + failed * 15 + rolledBack * 5;
  return Math.max(0, Math.min(100, Math.round(weighted / total)));
}

export function buildDevQualitySnapshot(memory: ExecutionMemoryEntry[]) {
  const outcomes = latestExecutionPerRequest(memory);
  const counts = { validated: 0, failed: 0, rolledBack: 0, pending: 0 };
  for (const entry of outcomes) counts[executionOutcome(entry)] += 1;
  const executions = outcomes.length;
  const provenPlaybooks = memory.filter(isProvenExecutionOutcome).length;
  const metrics: DevQualityMetrics = {
    executions,
    validated: counts.validated,
    failed: counts.failed,
    rolledBack: counts.rolledBack,
    pending: counts.pending,
    validationRate: executions ? Number((counts.validated / executions).toFixed(3)) : 0,
    failureRate: executions ? Number((counts.failed / executions).toFixed(3)) : 0,
    rollbackRate: executions ? Number((counts.rolledBack / executions).toFixed(3)) : 0,
    qualityScore: scoreFromCounts(counts.validated, counts.failed, counts.rolledBack, counts.pending),
    provenPlaybooks,
    lastEvaluatedAt: new Date().toISOString(),
  };

  const modules = new Map<string, {
    executions: ExecutionMemoryEntry[];
    files: Map<string, number>;
  }>();
  for (const entry of outcomes) {
    const module = executionModuleKey(entry);
    const bucket = modules.get(module) ?? { executions: [], files: new Map<string, number>() };
    bucket.executions.push(entry);
    for (const file of entry.changedFiles) bucket.files.set(file, (bucket.files.get(file) ?? 0) + 1);
    modules.set(module, bucket);
  }

  const profiles: DevModuleProfile[] = [...modules.entries()].map(([module, bucket]) => {
    const moduleCounts = { validated: 0, failed: 0, rolledBack: 0, pending: 0 };
    for (const entry of bucket.executions) moduleCounts[executionOutcome(entry)] += 1;
    const topFiles = [...bucket.files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([file]) => file);
    const requestIds = new Set(bucket.executions.map((entry) => entry.requestId));
    const modulePlaybooks = memory.filter((entry) => requestIds.has(entry.requestId) && isProvenExecutionOutcome(entry)).length;
    return {
      module,
      executions: bucket.executions.length,
      validated: moduleCounts.validated,
      failed: moduleCounts.failed,
      rolledBack: moduleCounts.rolledBack,
      pending: moduleCounts.pending,
      qualityScore: scoreFromCounts(moduleCounts.validated, moduleCounts.failed, moduleCounts.rolledBack, moduleCounts.pending),
      provenPlaybooks: modulePlaybooks,
      lastSeenAt: bucket.executions.map((entry) => entry.recordedAt).sort().at(-1) ?? new Date(0).toISOString(),
      topFiles,
    };
  }).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  return { metrics, modules: profiles };
}

export async function recordEngineeringMemory(entry: EngineeringMemoryEntry) {
  const issue = await ensureMemoryIssue();
  const existing = await loadEngineeringMemory(25);
  if (existing.some((item) => item.requestId === entry.requestId)) return { skipped: true, reason: "duplicate_request_id" };

  const safeEntry: EngineeringMemoryEntry = {
    requestId: String(entry.requestId).slice(0, 120),
    route: String(entry.route).slice(0, 500),
    recordedAt: new Date(entry.recordedAt).toISOString(),
    primary: String(entry.primary).slice(0, 80),
    consulted: entry.consulted.slice(0, 5).map((v) => String(v).slice(0, 80)),
    consensus: String(entry.consensus).slice(0, 3000),
    conflicts: entry.conflicts.slice(0, 8).map((v) => String(v).slice(0, 900)),
    validation: entry.validation.slice(0, 8).map((v) => String(v).slice(0, 500)),
    confidence: Math.max(0, Math.min(1, Number(entry.confidence))),
  };

  const { owner, repo } = githubConfig();
  const comment = await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `${MEMORY_MARKER}\n${JSON.stringify(safeEntry)}` }),
  });
  return { skipped: false, issueNumber: issue.number, commentId: comment.id };
}

export async function recordExecutionMemory(entry: ExecutionMemoryEntry) {
  const issue = await ensureMemoryIssue();
  const existing = await loadExecutionMemory(25);
  const signature = `${entry.requestId}:${entry.status}:${entry.mergeSha ?? ""}:${entry.pullRequestNumber ?? ""}`;
  const duplicate = existing.some((item) => `${item.requestId}:${item.status}:${item.mergeSha ?? ""}:${item.pullRequestNumber ?? ""}` === signature);
  if (duplicate) return { skipped: true, reason: "duplicate_execution_outcome" };

  const safeEntry: ExecutionMemoryEntry = {
    requestId: String(entry.requestId).slice(0, 120),
    route: String(entry.route || "/").slice(0, 500),
    recordedAt: new Date(entry.recordedAt).toISOString(),
    status: String(entry.status || "unknown").slice(0, 60),
    summary: String(entry.summary || "").slice(0, 1200),
    ...(entry.pullRequestNumber && entry.pullRequestNumber > 0 ? { pullRequestNumber: Math.trunc(entry.pullRequestNumber) } : {}),
    ...(entry.mergeSha ? { mergeSha: String(entry.mergeSha).slice(0, 64) } : {}),
    changedFiles: entry.changedFiles.slice(0, 20).map((v) => String(v).slice(0, 300)),
    engines: entry.engines.slice(0, 5).map((v) => String(v).slice(0, 80)),
    failures: entry.failures.slice(0, 8).map((v) => String(v).slice(0, 500)),
    evidence: entry.evidence.slice(0, 8).map((v) => String(v).slice(0, 500)),
  };

  const { owner, repo } = githubConfig();
  const comment = await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `${EXECUTION_MARKER}\n${JSON.stringify(safeEntry)}` }),
  });
  return { skipped: false, issueNumber: issue.number, commentId: comment.id };
}

const appendSchema = z.object({
  requestId: z.string().min(1).max(120),
  route: z.string().min(1).max(500),
  primary: z.string().min(1).max(80),
  consulted: z.array(z.string().max(80)).max(5),
  consensus: z.string().max(3000),
  conflicts: z.array(z.string().max(900)).max(8).default([]),
  validation: z.array(z.string().max(500)).max(8).default([]),
  confidence: z.number().min(0).max(1),
});

const executionSchema = z.object({
  requestId: z.string().min(1).max(120),
  route: z.string().min(1).max(500),
  status: z.string().min(1).max(60),
  summary: z.string().max(1200).default(""),
  pullRequestNumber: z.number().int().positive().optional(),
  mergeSha: z.string().max(64).optional(),
  changedFiles: z.array(z.string().max(300)).max(20).default([]),
  engines: z.array(z.string().max(80)).max(5).default([]),
  failures: z.array(z.string().max(500)).max(8).default([]),
  evidence: z.array(z.string().max(500)).max(8).default([]),
});

router.get("/support/dev/memory", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode consultar a memória técnica." });
  try {
    const [memory, executionMemory] = await Promise.all([loadEngineeringMemory(20), loadExecutionMemory(25)]);
    const quality = buildDevQualitySnapshot(executionMemory);
    return res.json({ success: true, memory, executionMemory, quality });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia memory load failed");
    return res.status(500).json({ error: "Falha ao carregar memória técnica" });
  }
});

router.get("/support/dev/quality", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode consultar qualidade do Dev IA." });
  try {
    const executionMemory = await loadExecutionMemory(25);
    const quality = buildDevQualitySnapshot(executionMemory);
    return res.json({ success: true, ...quality });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia quality load failed");
    return res.status(500).json({ error: "Falha ao avaliar qualidade do Dev IA" });
  }
});

router.post("/support/dev/memory", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode gravar memória técnica." });
  const parsed = appendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
  try {
    const result = await recordEngineeringMemory({ ...parsed.data, recordedAt: new Date().toISOString() });
    return res.json({ success: true, result });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia memory append failed");
    return res.status(500).json({ error: "Falha ao gravar memória técnica" });
  }
});

router.post("/support/dev/execution-memory", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode gravar resultados de execução." });
  const parsed = executionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
  try {
    const result = await recordExecutionMemory({ ...parsed.data, recordedAt: new Date().toISOString() });
    return res.json({ success: true, result });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia execution memory append failed");
    return res.status(500).json({ error: "Falha ao gravar resultado da execução" });
  }
});

export default router;