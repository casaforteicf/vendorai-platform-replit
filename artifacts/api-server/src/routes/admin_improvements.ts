import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { validateProductionRevision } from "./dev_agent_validation.js";

const router: IRouter = Router();
// Control-plane P0 #2873: keep this route in the homologation watch scope.

const STATUSES = [
  "solicitada",
  "em_desenvolvimento",
  "testando",
  "pronto_staging",
  "em_homologacao",
  "homologado",
  "aguardando_producao",
  "mergeado_main",
  "producao_validada",
  "cancelada",
  "bloqueada",
] as const;

const TEST_STATUSES = ["pending", "running", "passed", "failed"] as const;

const improvementAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(180).optional().default("application/octet-stream"),
  content: z.string().max(20000),
});

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
  changeScope: z.enum(["tenant", "vertical", "global_opcional", "global", "bug"]).optional().nullable(),
  scopeReason: z.string().trim().max(4000).optional().nullable(),
  tenantContextSnapshot: z.record(z.string(), z.unknown()).optional().nullable(),
  packageKey: z.string().trim().max(120).optional().nullable(),
  acceptanceCriteria: z.string().trim().max(12000).optional().default(""),
  riskSummary: z.string().trim().max(8000).optional().default(""),
  dependencies: z.string().trim().max(8000).optional().default(""),
  attachments: z.array(improvementAttachmentSchema).max(5).optional().default([]),
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
  attachments: z.array(improvementAttachmentSchema).max(5).optional(),
  changeScope: z.enum(["tenant", "vertical", "global_opcional", "global", "bug"]).nullable().optional(),
  scopeReason: z.string().trim().max(4000).nullable().optional(),
  tenantContextSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
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
  schemaReady = pool.query(
    "SELECT " +
      "to_regclass('public.admin_improvements') AS admin_improvements," +
      "to_regclass('public.admin_releases') AS admin_releases," +
      "to_regclass('public.admin_improvement_events') AS admin_improvement_events," +
      "to_regclass('public.admin_improvement_pr_registry') AS admin_improvement_pr_registry"
  ).then((result) => {
    const row = result.rows[0] ?? {};
    if (!row.admin_improvements || !row.admin_releases || !row.admin_improvement_events || !row.admin_improvement_pr_registry) {
      throw new Error("ADMIN_IMPROVEMENTS_SCHEMA_NOT_READY");
    }
  }).catch((error) => {
    schemaReady = null;
    throw error;
  });
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
      source_tenant_id AS "sourceTenantId", change_scope AS "changeScope", scope_reason AS "scopeReason",
      tenant_context_snapshot AS "tenantContextSnapshot", owner_agent AS "ownerAgent",
      agent_status AS "agentStatus", agent_summary AS "agentSummary",
      requested_at AS "requestedAt", due_at AS "dueAt",
      acceptance_criteria AS "acceptanceCriteria", risk_summary AS "riskSummary",
      dependencies, attachments,
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
      change_scope, scope_reason, tenant_context_snapshot,
      package_key, acceptance_criteria, risk_summary, dependencies, attachments
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22::jsonb)
    RETURNING id
  `, [
    id, input.title, input.description, input.module, input.priority,
    input.branch ?? null, input.prNumber ?? null, input.prUrl ?? null,
    input.homologUrl ?? null, input.productionUrl ?? null, actor(req),
    input.sourceType, input.sourceRefId ?? null, input.sourceTenantId ?? null,
    input.changeScope ?? null, input.scopeReason ?? null, JSON.stringify(input.tenantContextSnapshot ?? null),
    input.packageKey ?? null, input.acceptanceCriteria, input.riskSummary, input.dependencies,
    JSON.stringify(input.attachments ?? []),
  ]);
  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,payload,actor) VALUES ($1,$2,'created',$3,$4::jsonb,$5)",
    [randomUUID(), id, "Melhoria registrada no histórico oficial.", JSON.stringify({ sourceType: input.sourceType, packageKey: input.packageKey ?? null, attachments: (input.attachments ?? []).map((item) => ({ name: item.name, mimeType: item.mimeType })) }), actor(req)],
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
    acceptanceCriteria: "acceptance_criteria", riskSummary: "risk_summary", dependencies: "dependencies", attachments: "attachments",
    changeScope: "change_scope", scopeReason: "scope_reason", tenantContextSnapshot: "tenant_context_snapshot",
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
      WHERE id = ANY($1::uuid[]) AND status = 'em_homologacao'
      RETURNING id,title,module`,
    [parsed.data.ids],
  );

  if ((result.rowCount ?? 0) > 0) {
    const recipients = await pool.query(
      `SELECT id,tenant_id AS "tenantId"
         FROM users
        WHERE active=true
          AND platform_role='super_admin'
          AND tenant_id IS NOT NULL`,
    );
    const items = result.rows.map((row) => String(row.title)).join(" • ").slice(0, 1200);
    for (const recipient of recipients.rows) {
      await pool.query(
        `INSERT INTO notifications
           (id,tenant_id,recipient_user_id,title,message,type,category,created_at)
         VALUES ($1,$2,$3,$4,$5,'warning','release_approval_required',now())`,
        [
          randomUUID(),
          String(recipient.tenantId),
          String(recipient.id),
          "Aprovação necessária para publicar",
          ("Há " + String(result.rowCount ?? 0) + " melhoria(s) homologada(s) aguardando sua aprovação para produção. " + items + ". Abra Melhorias & Publicações para aprovar ou pedir alteração.").slice(0, 4000),
        ],
      ).catch(() => undefined);
    }
  }

  res.json({ updated: result.rowCount ?? 0, approvalNotificationSent: (result.rowCount ?? 0) > 0 });
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


const FAILED_GITHUB_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "stale",
  "startup_failure",
]);

async function githubCheckSummary(owner: string, repo: string, sha: string) {
  const summarize = (runs: any[], source: string) => {
    const failed = runs.filter((run: any) =>
      FAILED_GITHUB_CONCLUSIONS.has(String(run?.conclusion ?? "")),
    );
    const running = runs.filter((run: any) => String(run?.status ?? "") !== "completed");
    const completed = runs.filter((run: any) => String(run?.status ?? "") === "completed");

    let testStatus: "pending" | "running" | "passed" | "failed" = "pending";
    if (failed.length) testStatus = "failed";
    else if (running.length) testStatus = "running";
    else if (completed.length) testStatus = "passed";

    return {
      available: true,
      source,
      testStatus,
      summary: JSON.stringify({
        source,
        sha,
        total: runs.length,
        failed: failed.length,
        running: running.length,
        checks: runs.slice(0, 30).map((run: any) => ({
          name: String(run?.name ?? run?.workflow_name ?? "check"),
          status: String(run?.status ?? "unknown"),
          conclusion: run?.conclusion ? String(run.conclusion) : null,
          url: run?.html_url ? String(run.html_url) : null,
        })),
        checkedAt: new Date().toISOString(),
      }).slice(0, 8000),
    };
  };

  try {
    const payload = await githubJson(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`,
    );
    const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
    return summarize(runs, "github-check-runs");
  } catch (checkError) {
    try {
      const payload = await githubJson(
        `/repos/${owner}/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`,
      );
      const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
      return summarize(runs, "github-actions-runs");
    } catch (actionsError) {
      const warning = actionsError instanceof Error
        ? actionsError.message
        : checkError instanceof Error
          ? checkError.message
          : "Falha ao consultar checks";
      return {
        available: false,
        source: "github-unavailable",
        testStatus: "pending" as const,
        summary: JSON.stringify({
          source: "github-unavailable",
          sha,
          warning,
          semanticStatus: "awaiting_evidence",
          checkedAt: new Date().toISOString(),
        }).slice(0, 8000),
      };
    }
  }
}

export async function reconcileGithubImprovements(actorName = "vendi:reconcile") {
  await ensureSchema();

  let config: GithubConfig;
  try {
    config = githubConfig();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "GITHUB_CONFIG_ERROR");
  }

  try {
    const repoInfo = await githubJson(`/repos/${config.owner}/${config.repo}`);
    const now = Date.now();
    const terminalStatuses = new Set(["producao_validada", "cancelada"]);
    const tracked = await pool.query(
      `SELECT DISTINCT ON (pr_number)
              id,title,status,test_status AS "testStatus",pr_number AS "prNumber",
              pr_url AS "prUrl",branch,due_at AS "dueAt",updated_at AS "updatedAt",
              source_type AS "sourceType",source_ref_id AS "sourceRefId",agent_status AS "agentStatus"
         FROM admin_improvements
        WHERE pr_number IS NOT NULL
        ORDER BY pr_number,updated_at DESC,created_at DESC`,
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let inconsistent = 0;
    let merged = 0;
    let closedWithoutMerge = 0;
    let conflicted = 0;
    let overdue = 0;

    const trackedPrNumbers = new Set<number>();

    for (const item of tracked.rows) {
      if (String(item.agentStatus ?? "") === "repairing") {
        skipped += 1;
        continue;
      }
      const prNumber = Number(item.prNumber ?? 0);
      if (!prNumber) {
        skipped += 1;
        continue;
      }
      trackedPrNumbers.add(prNumber);

      try {
        const pr = await githubJson(`/repos/${config.owner}/${config.repo}/pulls/${prNumber}`);
        const headSha = String(pr?.head?.sha ?? "");
        const headBranch = String(pr?.head?.ref ?? item.branch ?? "");
        const baseBranch = String(pr?.base?.ref ?? "");
        const prUrl = pr?.html_url ? String(pr.html_url) : item.prUrl;
        const prState = String(pr?.state ?? "unknown");
        const isMerged = Boolean(pr?.merged || pr?.merged_at);
        const isClosedWithoutMerge = prState === "closed" && !isMerged;
        const supersededMatch = String(pr?.body ?? "").match(/substitu[ií]do\s+por\s+#(\d+)/i);
        const supersededByPr = supersededMatch ? Number(supersededMatch[1]) : null;
        const isSuperseded = isClosedWithoutMerge && Boolean(supersededByPr);
        const hasConflict = prState === "open" && pr?.mergeable === false;
        const isOverdue = Boolean(
          item.dueAt &&
          new Date(item.dueAt).getTime() < now &&
          !terminalStatuses.has(String(item.status)),
        );

        const isPrimaryBase = baseBranch === "main" || baseBranch === "staging";
        const isChainedLegacy = Boolean(baseBranch && !isPrimaryBase);
        const mergeRevision = String(pr?.merge_commit_sha ?? pr?.merged_commit_sha ?? "");

        const check = headSha
          ? await githubCheckSummary(config.owner, config.repo, headSha)
          : { testStatus: "pending" as const, summary: JSON.stringify({ warning: "PR sem head SHA" }) };

        let nextStatus = String(item.status ?? "solicitada");
        let nextTestStatus: "pending" | "running" | "passed" | "failed" = check.testStatus;
        let nextAgentStatus = "desenvolvendo";
        let reason = "";

        if (terminalStatuses.has(nextStatus)) {
          nextAgentStatus = "concluido";
        } else if (isMerged && baseBranch === "main" && mergeRevision) {
          const production = await validateProductionRevision(mergeRevision).catch(() => null);
          if (production?.state === "validated") {
            nextStatus = "producao_validada";
            nextTestStatus = check.testStatus === "failed" ? "failed" : "passed";
            nextAgentStatus = "concluido";
            reason = "PR mergeado em main e revisão confirmada no runtime de produção";
          } else {
            nextStatus = "mergeado_main";
            nextTestStatus = check.testStatus === "failed" ? "failed" : "passed";
            nextAgentStatus = "validando_producao";
            reason = "PR mergeado em main; aguardando confirmação do deploy/validação";
          }
          merged += 1;
        } else if (isChainedLegacy) {
          nextStatus = "em_desenvolvimento";
          nextAgentStatus = "pr_legado_encadeado";
          reason = `PR legado/encadeado sobre ${baseBranch}; não conta como bloqueio atual da plataforma`;
          if (check.testStatus === "running") nextTestStatus = "running";
          else if (check.testStatus === "passed") nextTestStatus = "passed";
          else nextTestStatus = "pending";
        } else if (isSuperseded) {
          nextStatus = "cancelada";
          nextTestStatus = "pending";
          nextAgentStatus = "substituido_historico";
          reason = `PR substituído por #${supersededByPr}; preservado somente no histórico`;
        } else if (isClosedWithoutMerge) {
          nextStatus = "cancelada";
          nextTestStatus = "pending";
          nextAgentStatus = "substituido_historico";
          reason = "PR encerrado sem merge; preservado apenas no histórico e removido dos bloqueios ativos";
          closedWithoutMerge += 1;
        } else if (hasConflict) {
          nextStatus = "bloqueada";
          nextTestStatus = "failed";
          nextAgentStatus = "needs_attention";
          reason = "PR possui conflito de merge";
          conflicted += 1;
          inconsistent += 1;
        } else if (isMerged) {
          nextTestStatus = check.testStatus === "failed" ? "failed" : "passed";
          nextAgentStatus = nextTestStatus === "failed" ? "needs_attention" : "ready";
          if (nextTestStatus === "failed") {
            nextStatus = "bloqueada";
            reason = "PR foi mergeado, mas há check falhando";
            inconsistent += 1;
          } else if (baseBranch === "staging") {
            if (!["homologado", "aguardando_producao"].includes(nextStatus)) {
              nextStatus = "em_homologacao";
            }
            reason = "PR mergeado em staging";
          } else {
            nextStatus = "pronto_staging";
            reason = `PR mergeado em ${baseBranch || "base desconhecida"}`;
          }
          merged += 1;
        } else if (check.testStatus === "failed") {
          nextStatus = "bloqueada";
          nextAgentStatus = "needs_attention";
          reason = "Checks do PR falharam";
          inconsistent += 1;
        } else if (check.testStatus === "running") {
          nextStatus = "testando";
          nextAgentStatus = "validando";
          reason = "Checks do PR em andamento";
        } else if (check.testStatus === "passed") {
          nextStatus = "pronto_staging";
          nextAgentStatus = "pronto_para_revisao";
          reason = "Checks do PR aprovados";
        } else if (isOverdue && check.available) {
          nextStatus = "bloqueada";
          nextAgentStatus = "needs_attention";
          reason = "Prazo da melhoria venceu sem conclusão";
          overdue += 1;
          inconsistent += 1;
        } else {
          if (nextStatus === "bloqueada" && String(item.testStatus) !== "failed") {
            nextStatus = "testando";
          }
          nextTestStatus = "pending";
          nextAgentStatus = "aguardando_checks";
          reason = check.available
            ? "Aguardando evidências dos checks"
            : "Checks indisponíveis para leitura; aguardando evidências sem classificar como falha";
        }

        const summary = JSON.stringify({
          source: "github-reconcile",
          repository: config.repository,
          prNumber,
          prState,
          merged: isMerged,
          mergeable: pr?.mergeable ?? null,
          baseBranch,
          isChainedLegacy,
          isSuperseded,
          supersededByPr,
          headBranch,
          headSha,
          overdue: isOverdue,
          reason,
          checks: (() => {
            try { return JSON.parse(check.summary); } catch { return check.summary; }
          })(),
          reconciledAt: new Date().toISOString(),
        }).slice(0, 8000);

        const changed =
          nextStatus !== String(item.status) ||
          nextTestStatus !== String(item.testStatus) ||
          headBranch !== String(item.branch ?? "") ||
          String(prUrl ?? "") !== String(item.prUrl ?? "");

        await pool.query(
          `UPDATE admin_improvements
              SET branch=$2,
                  pr_url=$3,
                  test_status=$4,
                  test_summary=$5,
                  status=$6,
                  agent_status=$7,
                  agent_summary=$8,
                  updated_at=CASE WHEN $9 THEN now() ELSE updated_at END
            WHERE id=$1`,
          [
            String(item.id),
            headBranch || null,
            prUrl ?? null,
            nextTestStatus,
            summary,
            nextStatus,
            nextAgentStatus,
            reason,
            changed,
          ],
        );

        if (changed) {
          await pool.query(
            `INSERT INTO admin_improvement_events
               (id,improvement_id,event_type,message,payload,actor)
             VALUES ($1,$2,'github_state_changed',$3,$4::jsonb,$5)`,
            [
              randomUUID(),
              String(item.id),
              `GitHub reconciliado: ${reason || "estado atualizado"}.`,
              JSON.stringify({
                prNumber,
                from: { status: item.status, testStatus: item.testStatus },
                to: { status: nextStatus, testStatus: nextTestStatus },
                prState,
                merged: isMerged,
                mergeable: pr?.mergeable ?? null,
                baseBranch,
                overdue: isOverdue,
              }),
              actorName,
            ],
          );
          updated += 1;
        }
      } catch (error) {
        await pool.query(
          `UPDATE admin_improvements
              SET status=CASE
                    WHEN status='producao_validada' THEN status
                    WHEN test_status='failed' THEN status
                    WHEN pr_number IS NOT NULL THEN 'testando'
                    ELSE status
                  END,
                  test_status=CASE WHEN test_status='failed' THEN test_status ELSE 'pending' END,
                  agent_status='aguardando_checks',
                  agent_summary=$2,
                  updated_at=now()
            WHERE id=$1`,
          [
            String(item.id),
            ("Checks temporariamente indisponíveis para o PR #" + prNumber + ": " +
              (error instanceof Error ? error.message : "erro desconhecido")).slice(0, 12000),
          ],
        );
        await pool.query(
          `INSERT INTO admin_improvement_events
             (id,improvement_id,event_type,message,payload,actor)
           VALUES ($1,$2,'github_reconcile_failed',$3,$4::jsonb,$5)`,
          [
            randomUUID(),
            String(item.id),
            `Não foi possível reconciliar o PR #${prNumber}.`,
            JSON.stringify({ prNumber, error: error instanceof Error ? error.message : "erro desconhecido" }),
            actorName,
          ],
        );
      }
    }

    const list: any[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const pulls = await githubJson(
        `/repos/${config.owner}/${config.repo}/pulls?state=open&per_page=100&page=${page}&sort=updated&direction=desc`,
      );
      const batch = Array.isArray(pulls) ? pulls : [];
      list.push(...batch);
      if (batch.length < 100) break;
    }

    for (const pr of list) {
      const prNumber = Number(pr?.number ?? 0);
      const headSha = String(pr?.head?.sha ?? "");
      const headBranch = String(pr?.head?.ref ?? "");
      const prUrl = pr?.html_url ? String(pr.html_url) : null;
      const title = String(pr?.title ?? `PR #${prNumber}`).slice(0, 180);
      const body = String(pr?.body ?? "").slice(0, 8000);
      const sameRepository =
        !pr?.head?.repo?.full_name || String(pr.head.repo.full_name) === config.repository;

      if (!prNumber || !headSha || !sameRepository || trackedPrNumbers.has(prNumber)) {
        if (!prNumber || !headSha || !sameRepository) skipped += 1;
        continue;
      }

      const id = randomUUID();
      const claim = await pool.query(
        "INSERT INTO admin_improvement_pr_registry (pr_number,improvement_id,created_at,updated_at) VALUES ($1,$2,now(),now()) ON CONFLICT (pr_number) DO NOTHING RETURNING pr_number",
        [prNumber, id],
      );
      if (!claim.rowCount) {
        trackedPrNumbers.add(prNumber);
        skipped += 1;
        continue;
      }

      const check = await githubCheckSummary(config.owner, config.repo, headSha);
      const status =
        pr?.mergeable === false || check.testStatus === "failed"
          ? "bloqueada"
          : check.testStatus === "running"
            ? "testando"
            : check.testStatus === "passed"
              ? "pronto_staging"
              : check.available
                ? "em_desenvolvimento"
                : "testando";

      await pool.query(
        `INSERT INTO admin_improvements (
           id,title,description,module,priority,status,branch,pr_number,pr_url,
           test_status,test_summary,created_by,source_type,source_ref_id,
           owner_agent,agent_status,requested_at,due_at,created_at,updated_at
         ) VALUES (
           $1,$2,$3,'Plataforma','media',$4,$5,$6,$7,
           $8,$9,$10,'system',$11,
           'vendi',$12,now(),now()+interval '24 hours',now(),now()
         )`,
        [
          id,
          title,
          body,
          status,
          headBranch || null,
          prNumber,
          prUrl,
          check.testStatus,
          check.summary,
          actorName,
          `github-pr:${prNumber}`,
          status === "bloqueada"
            ? "needs_attention"
            : check.testStatus === "running"
              ? "validando"
              : check.testStatus === "passed"
                ? "pronto_para_revisao"
                : check.available
                  ? "desenvolvendo"
                  : "aguardando_checks",
        ],
      );

      await pool.query(
        `INSERT INTO admin_improvement_events
           (id,improvement_id,event_type,message,payload,actor)
         VALUES ($1,$2,'github_reconciled',$3,$4::jsonb,$5)`,
        [
          randomUUID(),
          id,
          `PR #${prNumber} importado automaticamente do GitHub.`,
          JSON.stringify({
            repository: config.repository,
            prNumber,
            headBranch,
            headSha,
          }),
          actorName,
        ],
      );
      created += 1;
    }

    return {
      ok: true,
      repository: repoInfo?.full_name ?? config.repository,
      scanned: tracked.rows.length + list.length,
      tracked: tracked.rows.length,
      openDiscovered: list.length,
      created,
      updated,
      skipped,
      inconsistent,
      merged,
      closedWithoutMerge,
      conflicted,
      overdue,
      reconciledAt: new Date().toISOString(),
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Falha ao reconciliar GitHub.");
  }
}

router.post("/admin/improvements/github-reconcile", async (req, res) => {
  try {
    const result = await reconcileGithubImprovements(actor(req));
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao reconciliar GitHub.";
    const status = message.includes("GITHUB_") ? 503 : 502;
    return res.status(status).json({ error: message, code: "GITHUB_RECONCILE_FAILED" });
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
