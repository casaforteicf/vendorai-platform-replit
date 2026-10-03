import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { pool } from "@workspace/db";

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

async function loadDbMemory(kind: "engineering" | "execution", limit: number) {
  const result = await pool.query(
    "SELECT payload FROM dev_agent_memory_entries WHERE kind=$1 ORDER BY created_at DESC LIMIT $2",
    [kind, Math.max(1, Math.min(25, limit))],
  );
  return result.rows.map((row) => row.payload).reverse();
}

async function recordDbMemory(kind: "engineering" | "execution", requestId: string, signature: string, payload: unknown) {
  const result = await pool.query(
    "INSERT INTO dev_agent_memory_entries (id,kind,request_id,signature,payload,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,now()) ON CONFLICT (signature) DO NOTHING RETURNING id",
    [randomUUID(), kind, requestId, signature, JSON.stringify(payload)],
  );
  return result.rows[0]?.id ?? null;
}

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
      "User-Agent": "VendorAI-Dev-Memory/2.0",
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
  try {
    const rows = await loadDbMemory("engineering", limit);
    if (rows.length) return rows as EngineeringMemoryEntry[];
  } catch {}
  const comments = await loadMemoryComments();
  return comments
    .map((comment: any) => parseMemoryComment(comment.body))
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(25, limit))) as EngineeringMemoryEntry[];
}

export async function loadExecutionMemory(limit = 12): Promise<ExecutionMemoryEntry[]> {
  try {
    const rows = await loadDbMemory("execution", limit);
    if (rows.length) return rows as ExecutionMemoryEntry[];
  } catch {}
  const comments = await loadMemoryComments();
  return comments
    .map((comment: any) => parseExecutionComment(comment.body))
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(25, limit))) as ExecutionMemoryEntry[];
}

export async function recordEngineeringMemory(entry: EngineeringMemoryEntry) {
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

  const signature = `engineering:${safeEntry.requestId}`;
  const dbId = await recordDbMemory("engineering", safeEntry.requestId, signature, safeEntry);
  if (!dbId) return { skipped: true, reason: "duplicate_request_id", storage: "database" };

  try {
    const issue = await ensureMemoryIssue();
    const { owner, repo } = githubConfig();
    const comment = await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: `${MEMORY_MARKER}\n${JSON.stringify(safeEntry)}` }),
    });
    return { skipped: false, storage: "database+github", id: dbId, issueNumber: issue.number, commentId: comment.id };
  } catch {
    return { skipped: false, storage: "database", id: dbId };
  }
}

export async function recordExecutionMemory(entry: ExecutionMemoryEntry) {
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

  const signature = [
    "execution",
    safeEntry.requestId,
    safeEntry.status,
    safeEntry.mergeSha ?? "",
    safeEntry.pullRequestNumber ?? "",
  ].join(":");
  const dbId = await recordDbMemory("execution", safeEntry.requestId, signature, safeEntry);
  if (!dbId) return { skipped: true, reason: "duplicate_execution_outcome", storage: "database" };

  try {
    const issue = await ensureMemoryIssue();
    const { owner, repo } = githubConfig();
    const comment = await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: `${EXECUTION_MARKER}\n${JSON.stringify(safeEntry)}` }),
    });
    return { skipped: false, storage: "database+github", id: dbId, issueNumber: issue.number, commentId: comment.id };
  } catch {
    return { skipped: false, storage: "database", id: dbId };
  }
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
    const [memory, executionMemory] = await Promise.all([loadEngineeringMemory(20), loadExecutionMemory(20)]);
    return res.json({ success: true, memory, executionMemory });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia memory load failed");
    return res.status(500).json({ error: "Falha ao carregar memória técnica" });
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
