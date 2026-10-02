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
  sourceType: z.enum(["super_admin", "support", "vendi", "system", "audit", "user_request", "bug", "security", "integration", "infrastructure", "hotfix"]).optional().default("super_admin"),
  sourceRefId: z.string().trim().max(220).optional().nullable(),
  sourceTenantId: z.string().trim().max(220).optional().nullable(),
  packageKey: z.string().trim().max(120).optional().nullable(),
  acceptanceCriteria: z.string().trim().max(12000).optional().default(""),
  riskSummary: z.string().trim().max(8000).optional().default(""),
  dependencies: z.string().trim().max(8000).optional().default(""),
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
  ownerAgent: z.string().trim().max(120).nullable().optional(),
  agentStatus: z.string().trim().max(120).nullable().optional(),
  agentSummary: z.string().trim().max(12000).nullable().optional(),
  acceptanceCriteria: z.string().trim().max(12000).optional(),
  riskSummary: z.string().trim().max(8000).optional(),
  dependencies: z.string().trim().max(8000).optional(),
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
      source_type text NOT NULL DEFAULT 'super_admin',
      source_ref_id text,
      source_tenant_id text,
      owner_agent text NOT NULL DEFAULT 'vendi',
      agent_status text NOT NULL DEFAULT 'idle',
      agent_summary text,
      requested_at timestamptz NOT NULL DEFAULT now(),
      due_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
      acceptance_criteria text NOT NULL DEFAULT '',
      risk_summary text NOT NULL DEFAULT '',
      dependencies text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_improvements_status_idx ON admin_improvements(status);
    CREATE INDEX IF NOT EXISTS admin_improvements_package_idx ON admin_improvements(package_key);
    CREATE INDEX IF NOT EXISTS admin_improvements_pr_idx ON admin_improvements(pr_number);
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'super_admin';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS source_ref_id text;
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS source_tenant_id text;
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS owner_agent text NOT NULL DEFAULT 'vendi';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS agent_status text NOT NULL DEFAULT 'idle';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS agent_summary text;
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS due_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS acceptance_criteria text NOT NULL DEFAULT '';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS risk_summary text NOT NULL DEFAULT '';
    ALTER TABLE admin_improvements ADD COLUMN IF NOT EXISTS dependencies text NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS admin_improvement_events (
      id uuid PRIMARY KEY,
      improvement_id uuid NOT NULL REFERENCES admin_improvements(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      message text NOT NULL DEFAULT '',
      payload jsonb,
      actor text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_improvement_events_improvement_idx
      ON admin_improvement_events(improvement_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_releases (
      id uuid PRIMARY KEY,
      version text NOT NULL UNIQUE,
      name text NOT NULL,
      summary text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft',
      improvement_ids uuid[] NOT NULL DEFAULT '{}',
      test_url text,
      test_status text NOT NULL DEFAULT 'pending',
      test_summary text,
      impact jsonb,
      base_sha text,
      head_sha text,
      approval_fingerprint text,
      approved_by text,
      approved_at timestamptz,
      scheduled_at timestamptz,
      started_at timestamptz,
      published_at timestamptz,
      duration_ms integer,
      release_pr_number integer,
      release_pr_url text,
      rollback_version text,
      last_error text,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_releases_status_idx ON admin_releases(status, scheduled_at);
  `).then(() => undefined);
  return schemaReady;
}

function actor(req: any) {
  return String(req.user?.email ?? req.user?.sub ?? "super_admin");
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
      source_type AS "sourceType", source_ref_id AS "sourceRefId",
      source_tenant_id AS "sourceTenantId", owner_agent AS "ownerAgent",
      agent_status AS "agentStatus", agent_summary AS "agentSummary",
      requested_at AS "requestedAt", due_at AS "dueAt",
      acceptance_criteria AS "acceptanceCriteria", risk_summary AS "riskSummary",
      dependencies,
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
      homolog_url, production_url, created_by, source_type, source_ref_id, source_tenant_id,
      package_key, acceptance_criteria, risk_summary, dependencies
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING id
  `, [
    id, input.title, input.description, input.module, input.priority,
    input.branch ?? null, input.prNumber ?? null, input.prUrl ?? null,
    input.homologUrl ?? null, input.productionUrl ?? null, actor(req),
    input.sourceType, input.sourceRefId ?? null, input.sourceTenantId ?? null,
    input.packageKey ?? null, input.acceptanceCriteria, input.riskSummary, input.dependencies,
  ]);
  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,payload,actor) VALUES ($1,$2,'created',$3,$4::jsonb,$5)",
    [randomUUID(), id, "Melhoria registrada no histórico oficial.", JSON.stringify({ sourceType: input.sourceType, packageKey: input.packageKey ?? null }), actor(req)],
  );
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
    ownerAgent: "owner_agent", agentStatus: "agent_status", agentSummary: "agent_summary",
    acceptanceCriteria: "acceptance_criteria", riskSummary: "risk_summary", dependencies: "dependencies",
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
  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,payload,actor) VALUES ($1,$2,'updated',$3,$4::jsonb,$5)",
    [randomUUID(), String(req.params.id), "Melhoria atualizada.", JSON.stringify(parsed.data), actor(req)],
  );
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
    `SELECT id, title, status FROM admin_improvements WHERE id = ANY($1::uuid[])`,
    [parsed.data.ids],
  );
  const blocked = check.rows.filter((row) => row.status !== "homologado");
  if (blocked.length) {
    return res.status(409).json({
      error: "Somente melhorias homologadas podem ser aprovadas para produção.",
      blocked: blocked.map((row) => ({ id: row.id, title: row.title, status: row.status })),
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
