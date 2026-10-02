import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

const STATUSES = [
  "solicitada",
  "em_desenvolvimento",
  "testando",
  "pronto_staging",
  "em_homologacao",
  "homologado",
  "aguardando_producao",
  "producao_validada",
  "bloqueada",
] as const;

const TEST_STATUSES = ["pending", "running", "passed", "failed"] as const;
const GATE_STATUSES = ["pending", "passed", "failed", "not_applicable"] as const;
const RELEASE_SCOPES = ["production", "homolog_only"] as const;

const createSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(8000).optional().default(""),
  module: z.string().trim().max(120).optional().default("Plataforma"),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).optional().default("media"),
  branch: z.string().trim().max(180).optional().nullable(),
  prNumber: z.number().int().positive().optional().nullable(),
  prUrl: z.string().url().optional().nullable(),
  homologUrl: z.string().url().optional().nullable(),
  productionUrl: z.string().url().optional().nullable(),
  releaseScope: z.enum(RELEASE_SCOPES).optional().default("production"),
  dependencyIds: z.array(z.string().uuid()).max(100).optional().default([]),
  securityGate: z.enum(GATE_STATUSES).optional().default("pending"),
  migrationGate: z.enum(GATE_STATUSES).optional().default("pending"),
  designGate: z.enum(GATE_STATUSES).optional().default("pending"),
  performanceGate: z.enum(GATE_STATUSES).optional().default("pending"),
  rollbackGate: z.enum(GATE_STATUSES).optional().default("pending"),
});

const patchSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(8000).optional(),
  module: z.string().trim().max(120).optional(),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
  status: z.enum(STATUSES).optional(),
  branch: z.string().trim().max(180).nullable().optional(),
  prNumber: z.number().int().positive().nullable().optional(),
  prUrl: z.string().url().nullable().optional(),
  homologUrl: z.string().url().nullable().optional(),
  productionUrl: z.string().url().nullable().optional(),
  packageKey: z.string().trim().max(120).nullable().optional(),
  testStatus: z.enum(TEST_STATUSES).optional(),
  testSummary: z.string().trim().max(8000).nullable().optional(),
  releaseScope: z.enum(RELEASE_SCOPES).optional(),
  dependencyIds: z.array(z.string().uuid()).max(100).optional(),
  securityGate: z.enum(GATE_STATUSES).optional(),
  migrationGate: z.enum(GATE_STATUSES).optional(),
  designGate: z.enum(GATE_STATUSES).optional(),
  performanceGate: z.enum(GATE_STATUSES).optional(),
  rollbackGate: z.enum(GATE_STATUSES).optional(),
});

const idsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const packageSchema = idsSchema.extend({
  packageKey: z.string().trim().min(3).max(120),
});

const mergeSchema = idsSchema.extend({
  target: z.literal("staging"),
});

type GithubConfig = { token: string; owner: string; repo: string; repository: string };

function githubConfig(): GithubConfig {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  const [owner, repo] = repository.split("/");
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo, repository };
}

async function githubJson(path: string, init?: RequestInit) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Release-Center/1.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 800) }; }
  if (!response.ok) throw new Error(body?.message ?? `GitHub HTTP ${response.status}`);
  return body;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS admin_improvements (
      id uuid PRIMARY KEY,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      module text NOT NULL DEFAULT 'Plataforma',
      priority text NOT NULL DEFAULT 'media',
      status text NOT NULL DEFAULT 'solicitada',
      branch text,
      pr_number integer,
      pr_url text,
      homolog_url text,
      production_url text,
      package_key text,
      test_status text NOT NULL DEFAULT 'pending',
      test_summary text,
      created_by text,
      approved_homolog_by text,
      approved_homolog_at timestamptz,
      approved_production_by text,
      approved_production_at timestamptz,
      merged_staging_sha text,
      release_scope text NOT NULL DEFAULT 'production',
      dependency_ids uuid[] NOT NULL DEFAULT '{}',
      security_gate text NOT NULL DEFAULT 'pending',
      migration_gate text NOT NULL DEFAULT 'pending',
      design_gate text NOT NULL DEFAULT 'pending',
      performance_gate text NOT NULL DEFAULT 'pending',
      rollback_gate text NOT NULL DEFAULT 'pending',
      github_state jsonb,
      github_synced_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_improvements_status_idx ON admin_improvements(status);
    CREATE INDEX IF NOT EXISTS admin_improvements_package_idx ON admin_improvements(package_key);
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS release_scope text NOT NULL DEFAULT 'production';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS dependency_ids uuid[] NOT NULL DEFAULT '{}';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS security_gate text NOT NULL DEFAULT 'pending';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS migration_gate text NOT NULL DEFAULT 'pending';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS design_gate text NOT NULL DEFAULT 'pending';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS performance_gate text NOT NULL DEFAULT 'pending';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS rollback_gate text NOT NULL DEFAULT 'pending';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS github_state jsonb;
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS github_synced_at timestamptz;
    CREATE INDEX IF NOT EXISTS admin_improvements_pr_idx ON admin_improvements(pr_number);
  `).then(() => undefined);
  return schemaReady;
}

function actor(req: any) {
  return String(req.user?.email ?? req.user?.sub ?? "super_admin");
}

function gateIssues(row: any) {
  const issues: string[] = [];
  if (row.release_scope === "homolog_only") issues.push("Item exclusivo de homologação");
  if (row.test_status !== "passed") issues.push("Testes não aprovados");
  const gateFields: Array<[string, string]> = [
    ["security_gate", "Segurança"],
    ["migration_gate", "Migration"],
    ["design_gate", "Design"],
    ["performance_gate", "Performance"],
    ["rollback_gate", "Rollback"],
  ];
  for (const [field, label] of gateFields) {
    if (!["passed", "not_applicable"].includes(row[field])) issues.push(`${label} não aprovado`);
  }
  return issues;
}

async function dependencyIssues(ids: string[]) {
  if (!ids.length) return new Map<string, string[]>();
  const result = await pool.query(
    `SELECT id, title, status, dependency_ids FROM admin_improvements WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const allDependencyIds = [...new Set(result.rows.flatMap((row) => row.dependency_ids ?? []))];
  const dependencies = allDependencyIds.length
    ? await pool.query(`SELECT id, title, status FROM admin_improvements WHERE id = ANY($1::uuid[])`, [allDependencyIds])
    : { rows: [] as any[] };
  const byId = new Map(dependencies.rows.map((row: any) => [row.id, row]));
  const issues = new Map<string, string[]>();
  for (const row of result.rows) {
    const itemIssues: string[] = [];
    for (const depId of row.dependency_ids ?? []) {
      const dep = byId.get(depId);
      if (!dep) itemIssues.push(`Dependência ${depId} não encontrada`);
      else if (!["homologado", "aguardando_producao", "producao_validada"].includes(dep.status)) {
        itemIssues.push(`Dependência "${dep.title}" ainda está em ${dep.status}`);
      }
    }
    issues.set(row.id, itemIssues);
  }
  return issues;
}


router.use("/admin/improvements", requireRole("super_admin"));

router.get("/admin/improvements", async (_req, res) => {
  await ensureSchema();
  const result = await pool.query(`
    SELECT
      id, title, description, module, priority, status, branch,
      pr_number AS "prNumber", pr_url AS "prUrl",
      homolog_url AS "homologUrl", production_url AS "productionUrl",
      package_key AS "packageKey", test_status AS "testStatus",
      test_summary AS "testSummary",
      approved_homolog_by AS "approvedHomologBy",
      approved_homolog_at AS "approvedHomologAt",
      approved_production_by AS "approvedProductionBy",
      approved_production_at AS "approvedProductionAt",
      merged_staging_sha AS "mergedStagingSha",
      release_scope AS "releaseScope", dependency_ids AS "dependencyIds",
      security_gate AS "securityGate", migration_gate AS "migrationGate",
      design_gate AS "designGate", performance_gate AS "performanceGate",
      rollback_gate AS "rollbackGate", github_state AS "githubState",
      github_synced_at AS "githubSyncedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM admin_improvements
    ORDER BY
      CASE priority WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
      created_at DESC
  `);
  res.json({ items: result.rows });
});

router.post("/admin/improvements", async (req, res) => {
  await ensureSchema();
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const id = randomUUID();
  const input = parsed.data;
  const result = await pool.query(`
    INSERT INTO admin_improvements (
      id, title, description, module, priority, branch, pr_number, pr_url,
      homolog_url, production_url, created_by, release_scope, dependency_ids,
      security_gate, migration_gate, design_gate, performance_gate, rollback_gate
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING id
  `, [
    id, input.title, input.description, input.module, input.priority,
    input.branch ?? null, input.prNumber ?? null, input.prUrl ?? null,
    input.homologUrl ?? null, input.productionUrl ?? null, actor(req),
    input.releaseScope, input.dependencyIds,
    input.securityGate, input.migrationGate, input.designGate, input.performanceGate, input.rollbackGate,
  ]);
  res.status(201).json({ id: result.rows[0]?.id ?? id });
});

router.patch("/admin/improvements/:id", async (req, res) => {
  await ensureSchema();
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const mapping: Record<string, string> = {
    title: "title", description: "description", module: "module", priority: "priority",
    status: "status", branch: "branch", prNumber: "pr_number", prUrl: "pr_url",
    homologUrl: "homolog_url", productionUrl: "production_url", packageKey: "package_key",
    testStatus: "test_status", testSummary: "test_summary",
    releaseScope: "release_scope", dependencyIds: "dependency_ids",
    securityGate: "security_gate", migrationGate: "migration_gate",
    designGate: "design_gate", performanceGate: "performance_gate",
    rollbackGate: "rollback_gate",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    const column = mapping[key];
    if (!column) continue;
    values.push(value ?? null);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) return res.status(422).json({ error: "Nenhum campo para atualizar" });
  values.push(String(req.params.id));
  const result = await pool.query(
    `UPDATE admin_improvements SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length} RETURNING id`,
    values,
  );
  if (!result.rowCount) return res.status(404).json({ error: "Melhoria não encontrada" });
  res.json({ ok: true });
});

router.post("/admin/improvements/package", async (req, res) => {
  await ensureSchema();
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const result = await pool.query(
    `UPDATE admin_improvements SET package_key = $1, updated_at = now() WHERE id = ANY($2::uuid[]) RETURNING id`,
    [parsed.data.packageKey, parsed.data.ids],
  );
  res.json({ updated: result.rowCount ?? 0, packageKey: parsed.data.packageKey });
});

router.post("/admin/improvements/approve-homologation", async (req, res) => {
  await ensureSchema();
  const parsed = idsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const check = await pool.query(
    `SELECT id, title, test_status, pr_number FROM admin_improvements WHERE id = ANY($1::uuid[])`,
    [parsed.data.ids],
  );
  const blocked = check.rows.filter((row) => row.test_status !== "passed" || !row.pr_number);
  if (blocked.length) {
    return res.status(409).json({
      error: "Existem melhorias sem teste aprovado ou sem PR vinculado.",
      blocked: blocked.map((row) => ({ id: row.id, title: row.title, testStatus: row.test_status, prNumber: row.pr_number })),
    });
  }

  const result = await pool.query(
    `UPDATE admin_improvements
       SET status = 'pronto_staging',
           approved_homolog_by = $1,
           approved_homolog_at = now(),
           updated_at = now()
     WHERE id = ANY($2::uuid[])
     RETURNING id`,
    [actor(req), parsed.data.ids],
  );
  res.json({ approved: result.rowCount ?? 0 });
});

router.post("/admin/improvements/merge-homologation", async (req, res) => {
  await ensureSchema();
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let config: GithubConfig;
  try {
    config = githubConfig();
  } catch (error) {
    return res.status(503).json({
      error: "Integração GitHub indisponível no backend de homologação.",
      code: error instanceof Error ? error.message : "GITHUB_CONFIG_ERROR",
    });
  }

  const items = await pool.query(
    `SELECT id, title, status, test_status, pr_number FROM admin_improvements WHERE id = ANY($1::uuid[])`,
    [parsed.data.ids],
  );

  const results: any[] = [];
  for (const item of items.rows) {
    if (item.status !== "pronto_staging" || item.test_status !== "passed" || !item.pr_number) {
      results.push({ id: item.id, ok: false, error: "Melhoria não está aprovada/pronta para staging." });
      continue;
    }
    try {
      const pr = await githubJson(`/repos/${config.owner}/${config.repo}/pulls/${item.pr_number}`);
      if (pr.state !== "open" || pr.draft) throw new Error("PR não está aberto/pronto");
      if (pr.base?.ref !== "staging") throw new Error(`PR aponta para ${pr.base?.ref ?? "base desconhecida"}; homologação exige staging`);
      if (pr.mergeable === false) throw new Error("PR possui conflito de merge");

      const merged = await githubJson(`/repos/${config.owner}/${config.repo}/pulls/${item.pr_number}/merge`, {
        method: "PUT",
        body: JSON.stringify({ merge_method: "squash", sha: pr.head?.sha }),
      });
      if (!merged.merged) throw new Error(merged.message ?? "GitHub não confirmou o merge");

      await pool.query(
        `UPDATE admin_improvements
           SET status = 'em_homologacao', merged_staging_sha = $1, updated_at = now()
         WHERE id = $2`,
        [merged.sha ?? null, item.id],
      );
      results.push({ id: item.id, ok: true, sha: merged.sha, prNumber: item.pr_number });
    } catch (error) {
      results.push({ id: item.id, ok: false, error: error instanceof Error ? error.message : "Falha no merge" });
    }
  }

  const ok = results.filter((item) => item.ok).length;
  res.status(ok === results.length ? 200 : 207).json({ merged: ok, total: results.length, results });
});

router.post("/admin/improvements/mark-homologated", async (req, res) => {
  await ensureSchema();
  const parsed = idsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const result = await pool.query(
    `UPDATE admin_improvements SET status = 'homologado', updated_at = now()
      WHERE id = ANY($1::uuid[]) AND status = 'em_homologacao' RETURNING id`,
    [parsed.data.ids],
  );
  res.json({ updated: result.rowCount ?? 0 });
});

router.post("/admin/improvements/approve-production", async (req, res) => {
  await ensureSchema();
  const parsed = idsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const check = await pool.query(
    `SELECT id, title, status, test_status, release_scope, dependency_ids,
            security_gate, migration_gate, design_gate, performance_gate, rollback_gate
       FROM admin_improvements WHERE id = ANY($1::uuid[])`,
    [parsed.data.ids],
  );
  const depIssues = await dependencyIssues(parsed.data.ids);
  const blocked = check.rows
    .map((row) => ({ row, issues: [...gateIssues(row), ...(depIssues.get(row.id) ?? [])] }))
    .filter(({ row, issues }) => row.status !== "homologado" || issues.length);
  if (blocked.length) {
    return res.status(409).json({
      error: "Somente melhorias homologadas podem ser aprovadas para produção.",
      blocked: blocked.map(({ row, issues }) => ({ id: row.id, title: row.title, status: row.status, issues })),
    });
  }

  const result = await pool.query(
    `UPDATE admin_improvements
       SET status = 'aguardando_producao',
           approved_production_by = $1,
           approved_production_at = now(),
           updated_at = now()
     WHERE id = ANY($2::uuid[])
     RETURNING id`,
    [actor(req), parsed.data.ids],
  );
  res.json({ approved: result.rowCount ?? 0 });
});


router.post("/admin/improvements/reconcile-github", async (_req, res) => {
  await ensureSchema();
  let config: GithubConfig;
  try {
    config = githubConfig();
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "GITHUB_CONFIG_ERROR" });
  }

  const compare = await githubJson(`/repos/${config.owner}/${config.repo}/compare/main...staging`);
  const commits = Array.isArray(compare.commits) ? compare.commits : [];
  const homologOnlyPatterns = [
    /homolog/i, /seed.*homolog/i, /passwordless/i, /without password/i,
    /preview railway/i, /capture.*staging/i, /dockerfile.*homolog/i,
  ];

  const summary = commits.map((commit: any) => {
    const message = String(commit.commit?.message ?? "").split("\n")[0];
    const scope = homologOnlyPatterns.some((pattern) => pattern.test(message)) ? "homolog_only" : "production";
    return {
      sha: commit.sha,
      shortSha: String(commit.sha).slice(0, 8),
      message,
      authoredAt: commit.commit?.author?.date ?? null,
      scope,
    };
  });

  res.json({
    repository: config.repository,
    status: compare.status,
    aheadBy: compare.ahead_by ?? 0,
    behindBy: compare.behind_by ?? 0,
    productionCandidates: summary.filter((item: any) => item.scope === "production"),
    homologOnly: summary.filter((item: any) => item.scope === "homolog_only"),
    total: summary.length,
    syncedAt: new Date().toISOString(),
  });
});

router.post("/admin/improvements/:id/evaluate-gates", async (req, res) => {
  await ensureSchema();
  const id = String(req.params.id);
  const result = await pool.query(
    `SELECT id, title, status, test_status, release_scope, dependency_ids,
            security_gate, migration_gate, design_gate, performance_gate, rollback_gate
       FROM admin_improvements WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Melhoria não encontrada" });
  const deps = await dependencyIssues([id]);
  const issues = [...gateIssues(row), ...(deps.get(id) ?? [])];
  res.json({ ready: issues.length === 0 && row.status === "homologado", issues, item: row });
});


const FAILED_GITHUB_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "stale",
  "startup_failure",
]);

async function githubCheckSummary(owner: string, repo: string, sha: string) {
  const payload = await githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`);
  const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const failed = runs.filter((run: any) => FAILED_GITHUB_CONCLUSIONS.has(String(run?.conclusion ?? "")));
  const running = runs.filter((run: any) => String(run?.status ?? "") !== "completed");
  const completed = runs.filter((run: any) => String(run?.status ?? "") === "completed");

  let testStatus: "pending" | "running" | "passed" | "failed" = "pending";
  if (failed.length) testStatus = "failed";
  else if (running.length) testStatus = "running";
  else if (completed.length) testStatus = "passed";

  const compact = runs.slice(0, 30).map((run: any) => ({
    name: String(run?.name ?? "check"),
    status: String(run?.status ?? "unknown"),
    conclusion: run?.conclusion ? String(run.conclusion) : null,
    url: run?.html_url ? String(run.html_url) : null,
  }));

  return {
    testStatus,
    summary: JSON.stringify({
      source: "github",
      sha,
      total: runs.length,
      failed: failed.length,
      running: running.length,
      checks: compact,
      checkedAt: new Date().toISOString(),
    }).slice(0, 8000),
  };
}

router.post("/admin/improvements/github-reconcile", async (req, res) => {
  await ensureSchema();

  let config: GithubConfig;
  try {
    config = githubConfig();
  } catch (error) {
    return res.status(503).json({
      error: "GitHub não está configurado no backend deste ambiente.",
      code: error instanceof Error ? error.message : "GITHUB_CONFIG_ERROR",
      required: ["GITHUB_DEV_TOKEN", "GITHUB_DEV_REPOSITORY"],
    });
  }

  try {
    const repoInfo = await githubJson(`/repos/${config.owner}/${config.repo}`);
    const pulls = await githubJson(
      `/repos/${config.owner}/${config.repo}/pulls?state=open&per_page=100&sort=updated&direction=desc`,
    );
    const list = Array.isArray(pulls) ? pulls : [];

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const reconciled: Array<{ prNumber: number; id: string; created: boolean; testStatus: string }> = [];

    for (const pr of list) {
      const prNumber = Number(pr?.number ?? 0);
      const headSha = String(pr?.head?.sha ?? "");
      const headBranch = String(pr?.head?.ref ?? "");
      const prUrl = pr?.html_url ? String(pr.html_url) : null;
      const title = String(pr?.title ?? `PR #${prNumber}`).slice(0, 180);
      const body = String(pr?.body ?? "").slice(0, 8000);
      const sameRepository = !pr?.head?.repo?.full_name || String(pr.head.repo.full_name) === config.repository;

      if (!prNumber || !headSha || !sameRepository) {
        skipped += 1;
        continue;
      }

      let check;
      try {
        check = await githubCheckSummary(config.owner, config.repo, headSha);
      } catch (error) {
        check = {
          testStatus: "pending" as const,
          summary: JSON.stringify({
            source: "github",
            sha: headSha,
            warning: error instanceof Error ? error.message : "Falha ao consultar checks",
            checkedAt: new Date().toISOString(),
          }).slice(0, 8000),
        };
      }

      const candidateStatus = check.testStatus === "failed"
        ? "bloqueada"
        : check.testStatus === "running"
          ? "testando"
          : "em_desenvolvimento";

      const existing = await pool.query(
        `SELECT id,status FROM admin_improvements WHERE pr_number=$1 LIMIT 1`,
        [prNumber],
      );

      if (existing.rowCount) {
        const id = String(existing.rows[0].id);
        await pool.query(
          `UPDATE admin_improvements
             SET title=$2,
                 branch=$3,
                 pr_url=$4,
                 test_status=$5,
                 test_summary=$6,
                 status=CASE
                   WHEN status IN ('homologado','aguardando_producao','producao_validada') THEN status
                   WHEN $5='failed' THEN 'bloqueada'
                   WHEN $5='running' THEN 'testando'
                   WHEN status='bloqueada' AND $5<>'failed' THEN 'em_desenvolvimento'
                   ELSE status
                 END,
                 agent_status=CASE
                   WHEN $5='failed' THEN 'bloqueado'
                   WHEN $5='running' THEN 'validando'
                   WHEN $5='passed' THEN 'pronto_para_revisao'
                   ELSE 'desenvolvendo'
                 END,
                 updated_at=now()
           WHERE id=$1`,
          [id, title, headBranch || null, prUrl, check.testStatus, check.summary],
        );
        updated += 1;
        reconciled.push({ prNumber, id, created: false, testStatus: check.testStatus });
        continue;
      }

      const id = randomUUID();
      await pool.query(
        `INSERT INTO admin_improvements (
           id,title,description,module,priority,status,branch,pr_number,pr_url,
           test_status,test_summary,created_by,source_type,owner_agent,agent_status,
           requested_at,due_at,created_at,updated_at
         ) VALUES (
           $1,$2,$3,'Plataforma','media',$4,$5,$6,$7,
           $8,$9,$10,'system','vendi',$11,
           now(),now()+interval '24 hours',now(),now()
         )`,
        [
          id,
          title,
          body,
          candidateStatus,
          headBranch || null,
          prNumber,
          prUrl,
          check.testStatus,
          check.summary,
          actor(req),
          check.testStatus === "failed"
            ? "bloqueado"
            : check.testStatus === "running"
              ? "validando"
              : check.testStatus === "passed"
                ? "pronto_para_revisao"
                : "desenvolvendo",
        ],
      );

      await pool.query(
        `INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,payload,actor)
         VALUES ($1,$2,'github_reconciled',$3,$4::jsonb,$5)`,
        [
          randomUUID(),
          id,
          `PR #${prNumber} importado automaticamente do GitHub.`,
          JSON.stringify({ prNumber, headBranch, headSha, repository: config.repository }),
          actor(req),
        ],
      );

      created += 1;
      reconciled.push({ prNumber, id, created: true, testStatus: check.testStatus });
    }

    return res.json({
      ok: true,
      repository: repoInfo?.full_name ?? config.repository,
      scanned: list.length,
      created,
      updated,
      skipped,
      reconciled,
      reconciledAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Falha ao reconciliar GitHub.",
      code: "GITHUB_RECONCILE_FAILED",
    });
  }
});

router.get("/admin/improvements/github-readiness", async (_req, res) => {
  try {
    const config = githubConfig();
    const repo = await githubJson(`/repos/${config.owner}/${config.repo}`);
    res.json({ ready: true, repository: repo.full_name, private: Boolean(repo.private) });
  } catch (error) {
    res.json({ ready: false, reason: error instanceof Error ? error.message : "github_unavailable" });
  }
});

export default router;
