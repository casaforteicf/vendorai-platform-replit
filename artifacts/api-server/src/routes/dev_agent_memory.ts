import { Router } from "express";
import { z } from "zod/v4";

const router = Router();
const MEMORY_ISSUE_TITLE = "[Dev IA] Memória de Engenharia";
const MEMORY_MARKER = "DEV_IA_MEMORY_V1";

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
      "User-Agent": "VendorAI-Dev-Memory/1.0",
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
        "Guarda somente resumos técnicos estruturados e não deve armazenar prompts brutos, tokens, credenciais ou segredos.",
        "Os registros são usados como memória de decisões anteriores pelo Conselho de Especialistas.",
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

export async function loadEngineeringMemory(limit = 12): Promise<EngineeringMemoryEntry[]> {
  const issue = await findMemoryIssue();
  if (!issue) return [];
  const { owner, repo } = githubConfig();
  const comments = await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments?per_page=100`);
  return (comments ?? [])
    .map((comment: any) => parseMemoryComment(comment.body))
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(25, limit))) as EngineeringMemoryEntry[];
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

router.get("/support/dev/memory", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode consultar a memória técnica." });
  try {
    const memory = await loadEngineeringMemory(20);
    return res.json({ success: true, memory });
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

export default router;
