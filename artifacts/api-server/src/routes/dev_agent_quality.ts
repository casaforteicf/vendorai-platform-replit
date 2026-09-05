import { Router } from "express";
import { loadExecutionMemory, type ExecutionMemoryEntry } from "./dev_agent_memory";

const router = Router();

type ExecutionOutcome = "validated" | "failed" | "rollback_prepared" | "pending";

type QualityMetrics = {
  executions: number;
  validated: number;
  failed: number;
  rollbackPrepared: number;
  pending: number;
  validationRate: number;
  failureRate: number;
  rollbackPreparedRate: number;
  qualityScore: number;
  provenPlaybooks: number;
  lastEvaluatedAt: string;
};

type ModuleQuality = {
  module: string;
  executions: number;
  validated: number;
  failed: number;
  rollbackPrepared: number;
  pending: number;
  qualityScore: number;
  provenPlaybooks: number;
  lastSeenAt: string;
  topFiles: string[];
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function isSystemMemory(entry: ExecutionMemoryEntry) {
  const status = normalize(entry.status);
  const engines = entry.engines.map((engine) => normalize(engine));
  return /incident|recovered|recovery/.test(status)
    || engines.some((engine) => /sentinel|server runtime/.test(engine));
}

function isProvenPlaybook(entry: ExecutionMemoryEntry) {
  return !isSystemMemory(entry)
    && normalize(entry.status) === "production validated"
    && entry.changedFiles.length > 0
    && entry.failures.length === 0;
}

function executionOutcome(entry: ExecutionMemoryEntry): ExecutionOutcome {
  const status = normalize(entry.status);
  if (status === "rollback prepared") return "rollback_prepared";
  if (isProvenPlaybook(entry)) return "validated";
  if (/failed|failure|error|blocked|step limit|execution incomplete|stale|unreachable|unsupported|not owned/.test(status)) return "failed";
  return "pending";
}

function latestPerRequest(memory: ExecutionMemoryEntry[]) {
  const grouped = new Map<string, ExecutionMemoryEntry[]>();
  for (const entry of memory) {
    if (isSystemMemory(entry)) continue;
    const current = grouped.get(entry.requestId) ?? [];
    current.push(entry);
    grouped.set(entry.requestId, current);
  }

  return [...grouped.values()]
    .map((entries) => [...entries].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0])
    .filter((entry): entry is ExecutionMemoryEntry => Boolean(entry));
}

function routeModule(route: string) {
  const clean = route.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!clean) return "platform/root";
  const parts = clean.split("/").filter(Boolean).filter((part) => !["api", "support"].includes(part));
  if (!parts.length) return "platform/root";
  if (parts[0] === "admin" && parts[1]) return `admin/${parts[1]}`;
  return parts.slice(0, 2).join("/");
}

function fileModule(files: string[]) {
  for (const path of files) {
    const normalized = path.toLowerCase();
    const page = normalized.match(/artifacts\/frontend\/src\/pages\/([^/.]+)/);
    if (page?.[1]) return `frontend/${page[1]}`;
    const component = normalized.match(/artifacts\/frontend\/src\/components\/([^/]+)/);
    if (component?.[1]) return `frontend/${component[1]}`;
    const api = normalized.match(/artifacts\/api-server\/src\/(?:routes|services|lib)\/([^/.]+)/);
    if (api?.[1]) return `backend/${api[1].replace(/^dev_agent_/, "dev-ia-")}`;
  }
  return null;
}

function moduleKey(entry: ExecutionMemoryEntry) {
  const byRoute = routeModule(entry.route);
  return byRoute !== "platform/root" ? byRoute : (fileModule(entry.changedFiles) ?? byRoute);
}

function outcomeCounts(entries: ExecutionMemoryEntry[]) {
  let validated = 0;
  let failed = 0;
  let rollbackPrepared = 0;
  let pending = 0;

  for (const entry of entries) {
    const outcome = executionOutcome(entry);
    if (outcome === "validated") validated += 1;
    else if (outcome === "failed") failed += 1;
    else if (outcome === "rollback_prepared") rollbackPrepared += 1;
    else pending += 1;
  }

  return { validated, failed, rollbackPrepared, pending };
}

function qualityScore(counts: ReturnType<typeof outcomeCounts>) {
  const total = counts.validated + counts.failed + counts.rollbackPrepared + counts.pending;
  if (!total) return 100;
  const weighted =
    counts.validated * 100 +
    counts.pending * 55 +
    counts.rollbackPrepared * 25 +
    counts.failed * 15;
  return Math.max(0, Math.min(100, Math.round(weighted / total)));
}

export function buildDevQualitySnapshot(memory: ExecutionMemoryEntry[]) {
  const executions = latestPerRequest(memory);
  const counts = outcomeCounts(executions);
  const total = executions.length;
  const metrics: QualityMetrics = {
    executions: total,
    ...counts,
    validationRate: total ? Number((counts.validated / total).toFixed(3)) : 0,
    failureRate: total ? Number((counts.failed / total).toFixed(3)) : 0,
    rollbackPreparedRate: total ? Number((counts.rollbackPrepared / total).toFixed(3)) : 0,
    qualityScore: qualityScore(counts),
    provenPlaybooks: memory.filter(isProvenPlaybook).length,
    lastEvaluatedAt: new Date().toISOString(),
  };

  const buckets = new Map<string, ExecutionMemoryEntry[]>();
  for (const entry of executions) {
    const key = moduleKey(entry);
    const current = buckets.get(key) ?? [];
    current.push(entry);
    buckets.set(key, current);
  }

  const modules: ModuleQuality[] = [...buckets.entries()].map(([module, entries]) => {
    const moduleCounts = outcomeCounts(entries);
    const fileFrequency = new Map<string, number>();
    for (const entry of entries) {
      for (const file of entry.changedFiles) fileFrequency.set(file, (fileFrequency.get(file) ?? 0) + 1);
    }
    const requestIds = new Set(entries.map((entry) => entry.requestId));
    return {
      module,
      executions: entries.length,
      ...moduleCounts,
      qualityScore: qualityScore(moduleCounts),
      provenPlaybooks: memory.filter((entry) => requestIds.has(entry.requestId) && isProvenPlaybook(entry)).length,
      lastSeenAt: entries.map((entry) => entry.recordedAt).sort().at(-1) ?? new Date(0).toISOString(),
      topFiles: [...fileFrequency.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([file]) => file),
    };
  }).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  return { metrics, modules };
}

router.get("/support/dev/quality", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode consultar qualidade do Dev IA." });
  }

  try {
    const executionMemory = await loadExecutionMemory(25);
    const snapshot = buildDevQualitySnapshot(executionMemory);
    return res.json({ success: true, ...snapshot });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia quality snapshot failed");
    return res.status(500).json({ error: "Falha ao calcular qualidade do Dev IA" });
  }
});

export default router;
