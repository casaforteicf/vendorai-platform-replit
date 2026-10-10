import { Router, type IRouter } from "express";
import { createHash, randomUUID } from "crypto";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { executeDevAutonomousWork } from "./dev_agent_autonomy.js";
import { validateProductionRevision } from "./dev_agent_validation.js";
import { reconcileGithubImprovements } from "./admin_improvements.js";
import { collectDevAgentCheckEvidence } from "../lib/dev-agent-check-evidence.js";
import { runBrowserAgent } from "../services/browser-agent.js";
import { signToken } from "../lib/jwt.js";

const router: IRouter = Router();

const releaseCreateSchema = z.object({
  name: z.string().trim().min(3).max(180),
  summary: z.string().trim().max(6000).optional().default(""),
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const releaseScheduleSchema = z.object({
  scheduledAt: z.string().datetime().optional().nullable(),
  publishNow: z.boolean().optional().default(false),
});

const adjustmentSchema = z.object({
  message: z.string().trim().min(2).max(6000),
});

type GithubConfig = { token: string; owner: string; repo: string; repository: string };

function actor(req: any) {
  return String(req.user?.email ?? req.user?.sub ?? "super_admin");
}

function githubConfig(): GithubConfig {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  const parts = repository.split("/");
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  if (!parts[0] || !parts[1]) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner: parts[0], repo: parts[1], repository };
}

let githubRateLimitBackoffUntil = 0;

async function githubJson(path: string, init?: RequestInit) {
  const config = githubConfig();
  if (Date.now() < githubRateLimitBackoffUntil) {
    throw new Error("GITHUB_RATE_LIMIT_COOLDOWN_UNTIL:" + new Date(githubRateLimitBackoffUntil).toISOString());
  }
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + config.token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Release-Center/2.0",
      ...(init?.headers ?? {}),
    },
  });
  const raw = await response.text();
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 1000) }; }
  if (!response.ok) {
    const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? "");
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset") ?? "");
    if (response.status === 403 && remaining === 0) {
      githubRateLimitBackoffUntil =
        Number.isFinite(resetSeconds) && resetSeconds > 0
          ? Math.max(Date.now() + 60_000, resetSeconds * 1000 + 5_000)
          : Date.now() + 15 * 60_000;
    }
    throw new Error(body?.message ?? "GitHub HTTP " + response.status);
  }
  return body;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = pool.query(
    "SELECT " +
      "to_regclass('public.admin_improvements') AS admin_improvements," +
      "to_regclass('public.admin_releases') AS admin_releases," +
      "to_regclass('public.admin_improvement_events') AS admin_improvement_events"
  ).then((result) => {
    const row = result.rows[0] ?? {};
    if (!row.admin_improvements || !row.admin_releases || !row.admin_improvement_events) {
      throw new Error("RELEASE_CENTER_SCHEMA_NOT_READY");
    }
  }).catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function extractAction(result: any, tool: string) {
  const actions = Array.isArray(result?.actions) ? result.actions : [];
  const match = [...actions].reverse().find((item: any) => item?.tool === tool && item?.ok);
  return match?.detail ?? null;
}

async function nextReleaseVersion() {
  const dayResult = await pool.query("SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY.MM.DD') AS day");
  const day = String(dayResult.rows[0]?.day ?? "0000.00.00");
  const prefix = "v" + day + ".";
  const countResult = await pool.query("SELECT count(*)::int AS total FROM admin_releases WHERE version LIKE $1", [prefix + "%"]);
  return prefix + String(Number(countResult.rows[0]?.total ?? 0) + 1);
}

async function getReleaseById(id: string) {
  const result = await pool.query(
    "SELECT id,version,name,summary,status,improvement_ids AS \"improvementIds\",test_url AS \"testUrl\",test_status AS \"testStatus\",test_summary AS \"testSummary\",impact,base_sha AS \"baseSha\",head_sha AS \"headSha\",approval_fingerprint AS \"approvalFingerprint\",approved_by AS \"approvedBy\",approved_at AS \"approvedAt\",scheduled_at AS \"scheduledAt\",started_at AS \"startedAt\",published_at AS \"publishedAt\",duration_ms AS \"durationMs\",release_pr_number AS \"releasePrNumber\",release_pr_url AS \"releasePrUrl\",release_branch AS \"releaseBranch\",published_sha AS \"publishedSha\",rollback_version AS \"rollbackVersion\",last_error AS \"lastError\",created_by AS \"createdBy\",created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM admin_releases WHERE id=$1",
    [id],
  );
  return result.rows[0] ?? null;
}

async function collectReleaseImpact(ids: string[], candidateBranch = "staging") {
  const itemsResult = await pool.query(
    "SELECT id,title,module,status,test_status AS \"testStatus\",pr_number AS \"prNumber\",pr_url AS \"prUrl\",branch FROM admin_improvements WHERE id=ANY($1::uuid[]) ORDER BY created_at ASC",
    [ids],
  );
  if (itemsResult.rows.length !== ids.length) throw new Error("RELEASE_ITEMS_NOT_FOUND");

  const config = githubConfig();
  const expectedFiles = new Set<string>();
  const prs: any[] = [];

  for (const item of itemsResult.rows) {
    if (!item.prNumber) {
      prs.push({ id: item.id, title: item.title, ready: false, reason: "PR não vinculado" });
      continue;
    }
    const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber);
    const files = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber + "/files?per_page=100");
    const names = (Array.isArray(files) ? files : []).map((file: any) => String(file.filename));
    names.forEach((name: string) => expectedFiles.add(name));
    prs.push({
      id: item.id,
      title: item.title,
      prNumber: item.prNumber,
      prUrl: pr.html_url ?? item.prUrl,
      base: pr.base?.ref ?? null,
      head: pr.head?.ref ?? item.branch,
      headSha: pr.head?.sha ?? null,
      merged: Boolean(pr.merged),
      mergeable: pr.mergeable,
      testStatus: item.testStatus,
      files: names,
      ready: item.testStatus === "passed",
    });
  }

  const mainRef = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/main");
  let candidateRef: any;
  let candidateExists = true;
  try {
    candidateRef = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/" + encodeURIComponent(candidateBranch));
  } catch {
    candidateRef = mainRef;
    candidateExists = false;
  }

  const baseSha = String(mainRef.object?.sha ?? "");
  const headSha = String(candidateRef.object?.sha ?? "");
  const compare = baseSha === headSha
    ? { files: [] }
    : await githubJson("/repos/" + config.owner + "/" + config.repo + "/compare/" + encodeURIComponent(baseSha) + "..." + encodeURIComponent(headSha));
  const actualFiles = (compare.files ?? []).map((file: any) => ({
    path: String(file.filename),
    status: String(file.status ?? "modified"),
    additions: Number(file.additions ?? 0),
    deletions: Number(file.deletions ?? 0),
    changes: Number(file.changes ?? 0),
  }));
  const actualNames = new Set(actualFiles.map((file: any) => file.path));
  const expected = [...expectedFiles].sort();
  const unexpected = actualFiles.filter((file: any) => !expectedFiles.has(file.path));
  const missing = expected.filter((file) => !actualNames.has(file));
  const notReady = prs.filter((pr) => !pr.ready);

  return {
    checkedAt: new Date().toISOString(),
    repository: config.repository,
    base: { branch: "main", sha: baseSha },
    head: { branch: candidateExists ? candidateBranch : "main", sha: headSha },
    prs,
    expectedFiles: expected,
    actualFiles,
    unexpectedFiles: unexpected,
    missingExpectedFiles: missing,
    notReady,
    clean: candidateExists && unexpected.length === 0 && missing.length === 0 && notReady.length === 0 && baseSha !== headSha,
  };
}


async function createReleaseCandidateBranch(version: string, ids: string[]) {
  const config = githubConfig();
  const mainRef = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/main");
  const mainSha = String(mainRef.object?.sha ?? "");
  if (!mainSha) throw new Error("MAIN_SHA_NOT_FOUND");

  const safeVersion = version.replace(/[^0-9A-Za-z._-]+/g, "-");
  const branch = "release/" + safeVersion;

  try {
    await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: mainSha }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Reference already exists/i.test(message)) throw error;
    await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/refs/heads/" + encodeURIComponent(branch), {
      method: "PATCH",
      body: JSON.stringify({ sha: mainSha, force: true }),
    });
  }

  const items = await pool.query(
    "SELECT id,title,branch,pr_number AS \"prNumber\" FROM admin_improvements WHERE id=ANY($1::uuid[]) ORDER BY created_at ASC",
    [ids],
  );
  if (items.rows.length !== ids.length) throw new Error("RELEASE_ITEMS_NOT_FOUND");

  const includedIds: string[] = [];
  for (const item of items.rows) {
    try {
      let head = item.branch ? String(item.branch) : "";
      if (!head && item.prNumber) {
        const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber);
        head = String(pr.head?.ref ?? "");
      }
      if (!head) throw new Error("Melhoria sem branch técnica");

      const merged = await githubJson("/repos/" + config.owner + "/" + config.repo + "/merges", {
        method: "POST",
        body: JSON.stringify({
          base: branch,
          head,
          commit_message: "[Release candidate " + version + "] " + item.title,
        }),
      });
      if (!merged?.sha) throw new Error("GitHub não confirmou merge na candidata");
      includedIds.push(String(item.id));
    } catch (error) {
      const reason = "Falha ao montar versão candidata: " + (error instanceof Error ? error.message : String(error));
      await pool.query(
        "UPDATE admin_improvements SET status='bloqueada',test_status='failed',agent_status='needs_attention',agent_summary=$2,package_key=NULL,updated_at=now() WHERE id=$1",
        [item.id, reason.slice(0,12000)],
      );
      await pool.query(
        "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'release_candidate_rejected',$3,'vendi:auto',$4::jsonb)",
        [randomUUID(), item.id, reason.slice(0,6000), JSON.stringify({ version, prNumber: item.prNumber ?? null, branch: item.branch ?? null })],
      );
    }
  }

  if (!includedIds.length) throw new Error("RELEASE_NO_MERGEABLE_ITEMS");
  const finalRef = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/" + encodeURIComponent(branch));
  return { branch, baseSha: mainSha, headSha: String(finalRef.object?.sha ?? ""), includedIds };
}

function releaseFingerprint(release: any, impact: any) {
  return hashJson({
    id: release.id,
    version: release.version,
    name: release.name,
    improvementIds: [...(release.improvementIds ?? [])].sort(),
    baseSha: impact?.base?.sha ?? release.baseSha ?? null,
    headSha: impact?.head?.sha ?? release.headSha ?? null,
    expectedFiles: [...(impact?.expectedFiles ?? [])].sort(),
    actualFiles: (impact?.actualFiles ?? []).map((file: any) => file.path).sort(),
  });
}


const fullAutonomyEnabled = () => {
  const value = process.env["VENDI_FULL_AUTONOMY_ENABLED"] ?? process.env["VENDI_AUTONOMY_ENABLED"] ?? "";
  return String(value).toLowerCase() === "true";
};

const protectedAutonomyPath = (path: string) => {
  const value = path.toLowerCase();
  return [
    "billing",
    "payment",
    "pagamento",
    "secret",
    "credential",
    "auth/",
    "middlewares/auth",
    "rls",
    "security",
    ".github/workflows/",
    "railway",
    "cloudflare",
  ].some((needle) => value.includes(needle));
};

function autonomyRisk(impact: any) {
  const files = Array.isArray(impact?.actualFiles) ? impact.actualFiles.map((file: any) => String(file?.path ?? "")) : [];
  const protectedFiles = files.filter(protectedAutonomyPath);
  return {
    protected: protectedFiles.length > 0,
    protectedFiles,
  };
}

async function autonomyPrincipal() {
  const result = await pool.query(
    "SELECT id,email,platform_role AS \"platformRole\",role,user_function AS \"userFunction\",tenant_id AS \"tenantId\" FROM users WHERE active=true ORDER BY CASE WHEN platform_role='super_admin' THEN 0 ELSE 1 END, created_at ASC LIMIT 1"
  );
  return result.rows[0] ?? null;
}

async function validateReleaseAutonomously(release: any) {
  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  if (!impact.clean) return { passed: false, reason: "impact_not_clean", impact };

  const risk = autonomyRisk(impact);
  if (risk.protected) {
    return { passed: false, reason: "protected_change", impact, risk };
  }

  const baseUrl = String(release.testUrl ?? process.env["HOMOLOGATION_URL"] ?? "").replace(/\/+$/, "");
  if (!baseUrl) return { passed: false, reason: "homologation_url_missing", impact };

  const principal = await autonomyPrincipal();
  if (!principal?.id) return { passed: false, reason: "autonomy_principal_missing", impact };

  const startUrl = baseUrl + "/admin/melhorias";
  const host = new URL(startUrl).hostname.toLowerCase();
  const firstPartyAuthToken = signToken({
    sub: String(principal.id),
    email: String(principal.email ?? ""),
    platformRole: "super_admin",
    tenantId: String(principal.tenantId ?? ""),
    role: String(principal.role ?? "admin"),
    userFunction: principal.userFunction ? String(principal.userFunction) : undefined,
    actorType: "ai",
  });

  const result = await runBrowserAgent({
    tenantId: String(principal.tenantId ?? "platform"),
    goal: [
      "Você é a Vendi validando automaticamente uma versão de homologação do VendorAI.",
      "Apenas navegue e leia. Não crie, aprove, publique, exclua ou salve dados.",
      "Confirme que Super Admin > Melhorias & Publicações carrega sem erro;",
      "confirme cards de status, abas Melhorias/Publicações, lista de itens e controles visíveis;",
      "registre qualquer erro de autenticação, renderização, rota ou navegação.",
      "Retorne PASSOU somente se a tela e o fluxo básico estiverem íntegros.",
    ].join("\n"),
    startUrl,
    mode: "autonomo",
    allowWrite: false,
    maxSteps: 24,
    allowedHosts: [host],
    firstPartyAuthToken,
  });

  return { passed: Boolean(result.ok), reason: result.ok ? "passed" : String(result.answer ?? "browser_validation_failed"), impact, result };
}

// A execução de IA pode gerar efeitos externos (branch/PR). Nunca repetir
// automaticamente uma tarefa cujo worker morreu antes de persistir o resultado.
// Sinalize-a para reconciliação humana/automática com GitHub antes de retomar.
async function quarantineInterruptedImprovements() {
  const stale = await pool.query(
    "UPDATE admin_improvements SET agent_status='needs_attention',status='bloqueada',agent_summary='Execução interrompida ou sem heartbeat por mais de 2 horas; reconciliar GitHub antes de tentar novamente.',updated_at=now() WHERE agent_status='running' AND updated_at < now() - interval '2 hours' RETURNING id"
  );
  for (const item of stale.rows) {
    await pool.query(
      "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'stale_execution_quarantined',$3,'vendi:worker',$4::jsonb)",
      [randomUUID(), item.id, 'Execução sem heartbeat isolada; nova tentativa não autorizada automaticamente.', JSON.stringify({ reason: 'stale_running', safeToRetry: false })],
    );
  }
  return stale.rowCount ?? 0;
}

async function advanceAutonomousImprovement() {
  const found = await pool.query(
    "WITH candidate AS (SELECT id FROM admin_improvements WHERE agent_status IN ('queued','idle') AND status IN ('solicitada','em_desenvolvimento') AND NOT EXISTS (SELECT 1 FROM admin_improvement_dependencies d LEFT JOIN admin_improvements predecessor ON predecessor.id=d.depends_on_id WHERE d.improvement_id=admin_improvements.id AND (predecessor.id IS NULL OR predecessor.status <> 'producao_validada')) ORDER BY CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE admin_improvements i SET status='em_desenvolvimento',owner_agent='vendi',agent_status='running',updated_at=now() FROM candidate c WHERE i.id=c.id RETURNING i.id,i.title,i.description,i.module,i.priority,i.source_type AS \"sourceType\",i.source_ref_id AS \"sourceRefId\""
  );
  const item = found.rows[0];
  if (!item) return false;

  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'agent_started','Vendi iniciou execução autônoma com Dev IA.','vendi:auto',$3::jsonb)",
    [randomUUID(), item.id, JSON.stringify({ sourceType: item.sourceType, sourceRefId: item.sourceRefId })],
  );

  // Heartbeat permite distinguir execução longa de execução abandonada.
  const heartbeat = setInterval(() => {
    void pool.query("UPDATE admin_improvements SET updated_at=now() WHERE id=$1 AND agent_status='running'", [item.id]).catch(() => undefined);
  }, 60_000);
  heartbeat.unref();
  try {
    const result = await executeDevAutonomousWork({
      requestId: String(item.id),
      request: String(item.title) + "\n\n" + String(item.description ?? ""),
      diagnosis: "Módulo: " + String(item.module ?? "Plataforma") + "\nPrioridade: " + String(item.priority ?? "media") + "\nOrigem: " + String(item.sourceType ?? "central"),
      route: "/admin/melhorias/" + String(item.id),
      source: "release_center_autonomous",
    });
    const pr = result.pullRequest ?? extractAction(result, "create_pr");
    const branch = extractAction(result, "create_branch")?.branch ?? null;
    const state = result.status === "approval_required"
      ? "needs_attention"
      : result.success && pr
        ? "waiting_tests"
        : result.success
          ? "completed"
          : "failed";
    const summary = String(result.summary ?? result.error ?? "Execução autônoma concluída sem resumo.").slice(0, 12000);

    await pool.query(
      "UPDATE admin_improvements SET branch=COALESCE($2,branch),pr_number=COALESCE($3,pr_number),pr_url=COALESCE($4,pr_url),status=CASE WHEN $5 IN ('waiting_tests','completed') THEN 'testando' WHEN $5='needs_attention' THEN 'bloqueada' ELSE 'em_desenvolvimento' END,test_status=CASE WHEN $6 THEN 'running' ELSE test_status END,test_summary=$7,agent_status=$5,agent_summary=$7,updated_at=now() WHERE id=$1",
      [item.id, branch, pr?.number ? Number(pr.number) : null, pr?.url ?? null, state, Boolean(pr?.preflight?.passed), summary],
    );
    await pool.query(
      "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'agent_result',$3,'vendi:auto',$4::jsonb)",
      [randomUUID(), item.id, summary.slice(0, 6000), JSON.stringify({ status: result.status, prNumber: pr?.number ?? null, prUrl: pr?.url ?? null, branch })],
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na execução autônoma";
    await pool.query(
      "UPDATE admin_improvements SET agent_status='failed',agent_summary=$2,status='em_desenvolvimento',updated_at=now() WHERE id=$1",
      [item.id, message.slice(0, 12000)],
    );
    return false;
  } finally {
    clearInterval(heartbeat);
  }
}

async function repairAutonomousBlockedImprovement() {
  const found = await pool.query(
    `WITH canonical AS (
       SELECT DISTINCT ON (pr_number)
              id,pr_number,title,description,module,priority,agent_summary,updated_at
         FROM admin_improvements
        WHERE pr_number IS NOT NULL
        ORDER BY pr_number,updated_at DESC,created_at DESC
     )
     SELECT *
       FROM canonical
      WHERE agent_summary IS NOT NULL
        AND id IN (
          SELECT id FROM admin_improvements
           WHERE status='bloqueada' AND agent_status='needs_attention'
        )
        AND updated_at < now() - interval '5 minutes'
      ORDER BY CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,updated_at ASC
      LIMIT 1`
  );
  const item = found.rows[0];
  if (!item) return false;

  const claimed = await pool.query(
    "UPDATE admin_improvements SET agent_status='repairing',owner_agent='vendi',updated_at=now() WHERE id=$1 AND status='bloqueada' AND agent_status='needs_attention' RETURNING id",
    [item.id],
  );
  if (!claimed.rowCount) return false;

  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'auto_repair_started',$3,'vendi:auto',$4::jsonb)",
    [randomUUID(), item.id, "Vendi iniciou correção automática do bloqueio.", JSON.stringify({ prNumber: item.pr_number, reason: item.agent_summary })],
  );

  try {
    const result = await executeDevAutonomousWork({
      requestId: String(item.id) + ":repair:" + String(item.pr_number),
      request: [
        "Corrija automaticamente esta melhoria bloqueada sem remover funcionalidades existentes.",
        "PR atual: #" + String(item.pr_number),
        "Título: " + String(item.title),
        "Descrição: " + String(item.description ?? ""),
        "Motivo do bloqueio: " + String(item.agent_summary ?? "não informado"),
        "Se o PR antigo estiver conflitado, obsoleto ou fechado, reconstrua uma versão limpa sobre a main atual e crie um PR substituto.",
        "Preserve o histórico e não altere caminhos protegidos sem exigir aprovação.",
      ].join("\n"),
      diagnosis: "Auto-reparo da Central. Módulo: " + String(item.module ?? "Plataforma") + ". Prioridade: " + String(item.priority ?? "media"),
      route: "/admin/melhorias/" + String(item.id),
      source: "release_center_auto_repair",
    });
    const pr = result.pullRequest ?? extractAction(result, "create_pr");
    const branch = extractAction(result, "create_branch")?.branch ?? null;
    const needsApproval = result.status === "approval_required";
    const success = Boolean(result.success && pr?.number);
    const summary = String(result.summary ?? result.error ?? "Auto-reparo concluído sem resumo.").slice(0,12000);

    await pool.query(
      `UPDATE admin_improvements
          SET branch=COALESCE($2,branch),
              pr_number=COALESCE($3,pr_number),
              pr_url=COALESCE($4,pr_url),
              status=CASE WHEN $5 THEN 'testando' WHEN $6 THEN 'bloqueada' ELSE 'bloqueada' END,
              test_status=CASE WHEN $5 THEN 'running' ELSE 'failed' END,
              agent_status=CASE WHEN $5 THEN 'waiting_tests' WHEN $6 THEN 'needs_attention' ELSE 'needs_attention' END,
              agent_summary=$7,
              updated_at=now()
        WHERE id=$1`,
      [item.id, branch, pr?.number ? Number(pr.number) : null, pr?.url ?? null, success, needsApproval, summary],
    );
    await pool.query(
      "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'auto_repair_result',$3,'vendi:auto',$4::jsonb)",
      [randomUUID(), item.id, summary.slice(0,6000), JSON.stringify({ success, needsApproval, prNumber: pr?.number ?? null, prUrl: pr?.url ?? null, branch })],
    );
    return success;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no auto-reparo";
    await pool.query(
      "UPDATE admin_improvements SET agent_status='needs_attention',agent_summary=$2,updated_at=now() WHERE id=$1",
      [item.id, message.slice(0,12000)],
    );
    await pool.query(
      "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'auto_repair_result',$3,'vendi:auto',$4::jsonb)",
      [randomUUID(), item.id, message.slice(0,6000), JSON.stringify({ success: false, prNumber: item.pr_number ?? null })],
    ).catch(() => undefined);
    return false;
  }
}


async function refreshAutonomousImprovementChecks() {
  const found = await pool.query(
    "SELECT id,pr_number AS \"prNumber\" FROM admin_improvements WHERE pr_number IS NOT NULL AND status='testando' AND test_status IN ('pending','running') ORDER BY updated_at ASC LIMIT 1"
  );
  const item = found.rows[0];
  if (!item?.prNumber) return false;

  const config = githubConfig();
  const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber);
  let evidence: Awaited<ReturnType<typeof collectDevAgentCheckEvidence>>;
  try {
    evidence = await collectDevAgentCheckEvidence(String(pr.head.sha));
  } catch (error) {
    const warning = error instanceof Error ? error.message : "GitHub check evidence unavailable";
    await pool.query(
      "UPDATE admin_improvements SET test_status='pending',test_summary=$2,agent_status='aguardando_checks',status='testando',updated_at=now() WHERE id=$1",
      [item.id, JSON.stringify({ warning, semanticStatus: "awaiting_evidence", checkedAt: new Date().toISOString() }).slice(0,8000)],
    );
    return false;
  }
  const passed = pr.mergeable !== false
    && evidence.codeFailures.length === 0
    && evidence.pending.length === 0
    && evidence.successes.length > 0;
  const nextTest = passed ? "passed" : evidence.codeFailures.length > 0 ? "failed" : "running";
  const summary = {
    mergeable: pr.mergeable,
    successes: evidence.successes,
    codeFailures: evidence.codeFailures,
    infrastructureFailures: evidence.infrastructureFailures,
    externalFailures: evidence.externalFailures,
    pending: evidence.pending,
    regressionTestEvidence: evidence.regressionTestEvidence,
  };

  await pool.query(
    "UPDATE admin_improvements SET test_status=$2,test_summary=$3,agent_status=CASE WHEN $2='passed' THEN 'ready' WHEN $2='failed' THEN 'needs_attention' ELSE 'waiting_tests' END,status=CASE WHEN $2='passed' THEN 'pronto_staging' WHEN $2='failed' THEN 'em_desenvolvimento' ELSE 'testando' END,updated_at=now() WHERE id=$1",
    [item.id, nextTest, JSON.stringify(summary).slice(0, 8000)],
  );
  return passed;
}

async function createAutonomousReleaseIfReady() {
  const ready = await pool.query(
    `WITH canonical AS (
       SELECT DISTINCT ON (pr_number) id,title,priority,created_at,pr_number,status,test_status,package_key
         FROM admin_improvements
        WHERE pr_number IS NOT NULL
        ORDER BY pr_number,updated_at DESC,created_at DESC
     )
     SELECT id,title FROM canonical
      WHERE package_key IS NULL
        AND test_status='passed'
        AND status IN ('pronto_staging','em_homologacao','testando')
      ORDER BY CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,created_at ASC
      LIMIT 3`
  );
  if (!ready.rowCount) return null;

  const ids = ready.rows.map((row) => String(row.id));
  const version = await nextReleaseVersion();
  const candidate = await createReleaseCandidateBranch(version, ids);
  const includedIds = candidate.includedIds;
  const includedSet = new Set(includedIds);
  const includedRows = ready.rows.filter((row) => includedSet.has(String(row.id)));
  const impact = await collectReleaseImpact(includedIds, candidate.branch);
  const previous = await pool.query("SELECT version FROM admin_releases WHERE status='published' ORDER BY published_at DESC NULLS LAST LIMIT 1");
  const id = randomUUID();
  const summary = includedRows.map((row) => String(row.title)).join(" • ").slice(0, 6000);
  const risk = autonomyRisk(impact);
  const status = impact.clean && !risk.protected ? "ready" : "blocked";
  const lastError = risk.protected
    ? "Autonomia bloqueada por alteração protegida: " + risk.protectedFiles.join(", ")
    : !impact.clean
      ? "Impacto inconsistente na versão autônoma."
      : null;
  const testUrl = process.env["HOMOLOGATION_URL"] ?? "https://homolog.appvendorai.com";

  await pool.query(
    "INSERT INTO admin_releases (id,version,name,summary,status,improvement_ids,test_url,test_status,impact,base_sha,head_sha,release_branch,rollback_version,last_error,created_by) VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7,'pending',$8::jsonb,$9,$10,$11,$12,$13,'vendi:auto')",
    [id, version, "Publicação autônoma " + version, summary, status, includedIds, testUrl, JSON.stringify(impact), impact.base.sha, impact.head.sha, candidate.branch, previous.rows[0]?.version ?? null, lastError],
  );
  await pool.query("UPDATE admin_improvements SET package_key=$1,agent_status='autonomous_release',updated_at=now() WHERE id=ANY($2::uuid[])", [version, includedIds]);
  return id;
}

async function advanceAutonomousRelease() {
  const pending = await pool.query(
    "SELECT id FROM admin_releases WHERE status='ready' AND test_status='pending' ORDER BY created_at ASC LIMIT 1"
  );
  const id = pending.rows[0]?.id;
  if (!id) return false;

  const release = await getReleaseById(String(id));
  if (!release) return false;

  await pool.query(
    "UPDATE admin_releases SET test_status='running',test_summary='Vendi iniciou validação autônoma.',updated_at=now() WHERE id=$1",
    [release.id],
  );

  const validation = await validateReleaseAutonomously(release);
  if (!validation.passed) {
    await pool.query(
      "UPDATE admin_releases SET status='blocked',test_status='failed',test_summary=$2,last_error=$2,updated_at=now() WHERE id=$1",
      [release.id, JSON.stringify({ reason: validation.reason, risk: (validation as any).risk ?? null }).slice(0, 12000)],
    );
    return false;
  }

  const fingerprint = releaseFingerprint(release, validation.impact);
  await pool.query(
    "UPDATE admin_releases SET test_status='passed',test_summary=$2,status='ready',impact=$3::jsonb,base_sha=$4,head_sha=$5,approval_fingerprint=$6,approved_by=NULL,approved_at=NULL,scheduled_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1",
    [
      release.id,
      JSON.stringify({ verdict: "passed", answer: (validation as any).result?.answer ?? "PASSOU", checkedAt: new Date().toISOString() }).slice(0, 12000),
      JSON.stringify(validation.impact),
      validation.impact.base.sha,
      validation.impact.head.sha,
      fingerprint,
    ],
  );
  // A política automática é independente do modo de desenvolvimento.
  // Mantê-la desativada até os testes reais do operador Contabo e do rollback.
  const autonomousApprovalEnabled = fullAutonomyEnabled()
    && String(process.env["VENDI_AUTO_APPROVE_RELEASES"] ?? "").toLowerCase() === "true";
  if (autonomousApprovalEnabled) {
    const evidence = await collectDevAgentCheckEvidence(String(validation.impact.head.sha));
    const safeToApprove = !autonomyRisk(validation.impact).protected
      && evidence.codeFailures.length === 0
      && evidence.pending.length === 0
      && evidence.successes.length > 0;
    if (safeToApprove) {
      // Janela fixa das 00h de São Paulo (03:00 UTC). Uma versão homologada
      // depois desta janela é agendada para a próxima, nunca para o passado.
      const now = new Date();
      const scheduledAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3));
      if (scheduledAt.getTime() <= now.getTime()) scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
      await pool.query(
        "UPDATE admin_releases SET status='scheduled',approved_by='vendi:auto',approved_at=now(),scheduled_at=$2,last_error=NULL,updated_at=now() WHERE id=$1 AND status='ready' AND test_status='passed' AND approval_fingerprint=$3",
        [release.id, scheduledAt, fingerprint],
      );
      return true;
    }
  }
  await notifySuperAdminsApprovalRequired({
    title: "Publicação homologada — revisão de política pendente",
    message: ("A versão " + String(release.version) + " — " + String(release.name) + " concluiu a validação automática. A política de aprovação e a programação de publicação devem ser verificadas na Central; a homologação não significa deploy realizado."),
  });
  return true;
}

async function invalidateReleasesForImprovement(improvementId: string, reason: string) {
  await pool.query(
    "UPDATE admin_releases SET status=CASE WHEN status IN ('approved','scheduled') THEN 'blocked' ELSE status END,approval_fingerprint=CASE WHEN status IN ('approved','scheduled') THEN NULL ELSE approval_fingerprint END,approved_by=CASE WHEN status IN ('approved','scheduled') THEN NULL ELSE approved_by END,approved_at=CASE WHEN status IN ('approved','scheduled') THEN NULL ELSE approved_at END,last_error=CASE WHEN status IN ('approved','scheduled') THEN $2 ELSE last_error END,updated_at=now() WHERE $1::uuid=ANY(improvement_ids) AND status NOT IN ('published','cancelled','rolled_back')",
    [improvementId, reason],
  );
}

router.use("/admin", requireRole("super_admin"));

router.post("/admin/improvements/:id/adjustments", async (req, res) => {
  await ensureSchema();
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const improvementId = String(req.params.id);
  const exists = await pool.query("SELECT id FROM admin_improvements WHERE id=$1", [improvementId]);
  if (!exists.rowCount) return res.status(404).json({ error: "Melhoria não encontrada" });

  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor) VALUES ($1,$2,'adjustment',$3,$4)",
    [randomUUID(), improvementId, parsed.data.message, actor(req)],
  );
  await pool.query(
    "UPDATE admin_improvements SET status='em_desenvolvimento',test_status='pending',agent_status='queued',updated_at=now() WHERE id=$1",
    [improvementId],
  );
  await invalidateReleasesForImprovement(improvementId, "Melhoria alterada depois da montagem ou aprovação da publicação.");
  return res.json({ ok: true });
});

router.get("/admin/improvements/:id/events", async (req, res) => {
  await ensureSchema();
  const result = await pool.query(
    "SELECT id,event_type AS \"eventType\",message,payload,actor,created_at AS \"createdAt\" FROM admin_improvement_events WHERE improvement_id=$1 ORDER BY created_at ASC",
    [String(req.params.id)],
  );
  return res.json({ items: result.rows });
});

router.post("/admin/improvements/:id/start-agent", async (req, res) => {
  await ensureSchema();
  const improvementId = String(req.params.id);
  const found = await pool.query(
    "SELECT id,title,description,module,priority,status,source_type AS \"sourceType\",source_ref_id AS \"sourceRefId\",source_tenant_id AS \"sourceTenantId\" FROM admin_improvements WHERE id=$1",
    [improvementId],
  );
  const item = found.rows[0];
  if (!item) return res.status(404).json({ error: "Melhoria não encontrada" });

  await pool.query(
    "UPDATE admin_improvements SET status='em_desenvolvimento',owner_agent='vendi',agent_status='running',updated_at=now() WHERE id=$1",
    [improvementId],
  );
  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'agent_started','Vendi iniciou a execução técnica com o Dev IA.',$3,$4::jsonb)",
    [randomUUID(), improvementId, actor(req), JSON.stringify({ sourceType: item.sourceType, sourceRefId: item.sourceRefId })],
  );

  try {
    const result = await executeDevAutonomousWork({
      requestId: improvementId,
      request: item.title + "\n\n" + item.description,
      diagnosis: "Módulo: " + item.module + "\nPrioridade: " + item.priority + "\nOrigem: " + item.sourceType,
      route: "/admin/melhorias/" + improvementId,
      source: "release_center",
    });
    const pr = result.pullRequest ?? extractAction(result, "create_pr");
    const branch = extractAction(result, "create_branch")?.branch ?? null;
    const status = result.status === "approval_required"
      ? "needs_attention"
      : result.success && pr
        ? "waiting_tests"
        : result.success
          ? "completed"
          : "failed";
    const summary = String(result.summary ?? result.error ?? "Execução do agente concluída sem resumo.").slice(0, 12000);

    await pool.query(
      "UPDATE admin_improvements SET branch=COALESCE($2,branch),pr_number=COALESCE($3,pr_number),pr_url=COALESCE($4,pr_url),status=CASE WHEN $5='waiting_tests' THEN 'testando' WHEN $5='completed' THEN 'testando' WHEN $5='needs_attention' THEN 'bloqueada' ELSE 'em_desenvolvimento' END,test_status=CASE WHEN $6 THEN 'running' ELSE test_status END,test_summary=$7,agent_status=$5,agent_summary=$7,updated_at=now() WHERE id=$1",
      [improvementId, branch, pr?.number ? Number(pr.number) : null, pr?.url ?? null, status, Boolean(pr?.preflight?.passed), summary],
    );
    await pool.query(
      "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'agent_result',$3,'vendi',$4::jsonb)",
      [randomUUID(), improvementId, summary.slice(0, 6000), JSON.stringify({ status: result.status, prNumber: pr?.number ?? null, prUrl: pr?.url ?? null, branch })],
    );
    return res.status(result.status === "approval_required" ? 202 : 200).json({
      ok: Boolean(result.success),
      status: result.status,
      prNumber: pr?.number ?? null,
      prUrl: pr?.url ?? null,
      branch,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no agente";
    await pool.query(
      "UPDATE admin_improvements SET agent_status='failed',agent_summary=$2,status='em_desenvolvimento',updated_at=now() WHERE id=$1",
      [improvementId, message.slice(0, 12000)],
    );
    return res.status(500).json({ error: message });
  }
});

router.post("/admin/improvements/:id/check-tests", async (req, res) => {
  await ensureSchema();
  const improvementId = String(req.params.id);
  const found = await pool.query(
    "SELECT id,pr_number AS \"prNumber\" FROM admin_improvements WHERE id=$1",
    [improvementId],
  );
  const item = found.rows[0];
  if (!item) return res.status(404).json({ error: "Melhoria não encontrada" });
  if (!item.prNumber) return res.status(409).json({ error: "Melhoria ainda não possui PR" });

  const config = githubConfig();
  const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber);
  const evidence = await collectDevAgentCheckEvidence(String(pr.head.sha));
  const passed = pr.mergeable !== false
    && evidence.codeFailures.length === 0
    && evidence.pending.length === 0
    && evidence.successes.length > 0;
  const nextTest = passed ? "passed" : evidence.codeFailures.length > 0 ? "failed" : "running";
  const summary = {
    mergeable: pr.mergeable,
    successes: evidence.successes,
    codeFailures: evidence.codeFailures,
    infrastructureFailures: evidence.infrastructureFailures,
    externalFailures: evidence.externalFailures,
    pending: evidence.pending,
    regressionTestEvidence: evidence.regressionTestEvidence,
  };

  await pool.query(
    "UPDATE admin_improvements SET test_status=$2,test_summary=$3,agent_status=CASE WHEN $2='passed' THEN 'ready' WHEN $2='failed' THEN 'needs_attention' ELSE 'waiting_tests' END,status=CASE WHEN $2='passed' THEN 'pronto_staging' WHEN $2='failed' THEN 'em_desenvolvimento' ELSE 'testando' END,updated_at=now() WHERE id=$1",
    [improvementId, nextTest, JSON.stringify(summary).slice(0, 8000)],
  );
  return res.json({ passed, state: nextTest, mergeable: pr.mergeable, evidence });
});

router.post("/admin/improvements/:id/prepare-test", async (req, res) => {
  await ensureSchema();
  const improvementId = String(req.params.id);
  const found = await pool.query(
    "SELECT id,title,test_status AS \"testStatus\",pr_number AS \"prNumber\" FROM admin_improvements WHERE id=$1",
    [improvementId],
  );
  const item = found.rows[0];
  if (!item) return res.status(404).json({ error: "Melhoria não encontrada" });
  if (item.testStatus !== "passed" || !item.prNumber) return res.status(409).json({ error: "A melhoria precisa ter testes aprovados e PR vinculado." });

  const config = githubConfig();
  const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber);
  if (pr.base?.ref !== "staging") {
    return res.status(409).json({ error: "O PR da melhoria não aponta para staging." });
  }
  let mergeSha = pr.merge_commit_sha ?? null;
  if (!pr.merged) {
    const merged = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + item.prNumber + "/merge", {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash", sha: pr.head?.sha }),
    });
    if (!merged.merged) return res.status(409).json({ error: merged.message ?? "Não foi possível preparar a versão de teste." });
    mergeSha = merged.sha ?? null;
  }
  const homologUrl = process.env["HOMOLOGATION_URL"] ?? "https://homolog.appvendorai.com";
  await pool.query(
    "UPDATE admin_improvements SET status='em_homologacao',merged_staging_sha=COALESCE($2,merged_staging_sha),homolog_url=COALESCE(homolog_url,$3),agent_status='ready',updated_at=now() WHERE id=$1",
    [improvementId, mergeSha, homologUrl],
  );
  return res.json({ ok: true, homologUrl, mergeSha });
});

router.post("/admin/improvements/from-support/:bugId", async (req, res) => {
  await ensureSchema();
  const bugId = String(req.params.bugId);
  const reportResult = await pool.query(
    "SELECT id,tenant_id AS \"tenantId\",titulo,descricao,categoria,prioridade,rota_afetada AS \"rotaAfetada\",erro_tecnico AS \"erroTecnico\" FROM bug_reports WHERE id=$1",
    [bugId],
  );
  const report = reportResult.rows[0];
  if (!report) return res.status(404).json({ error: "Chamado não encontrado" });

  const linked = await pool.query(
    "SELECT id,title,status FROM admin_improvements WHERE source_type='support' AND source_ref_id=$1 LIMIT 1",
    [bugId],
  );
  if (linked.rowCount) return res.json({ created: false, improvement: linked.rows[0], reason: "already_linked" });

  const duplicate = await pool.query(
    "SELECT id,title,status FROM admin_improvements WHERE lower(title)=lower($1) AND status<>'producao_validada' ORDER BY created_at DESC LIMIT 1",
    [report.titulo],
  );
  if (duplicate.rowCount) {
    const item = duplicate.rows[0];
    await pool.query(
      "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'support_link',$3,$4,$5::jsonb)",
      [randomUUID(), item.id, "Chamado " + bugId + " vinculado como solicitação adicional.", actor(req), JSON.stringify({ bugId, tenantId: report.tenantId })],
    );
    return res.json({ created: false, improvement: item, reason: "deduplicated" });
  }

  const improvementId = randomUUID();
  const priorityMap: Record<string, string> = { critica: "urgente", alta: "alta", media: "media", baixa: "baixa" };
  const description = [
    report.descricao,
    report.rotaAfetada ? "\nTela/rota: " + report.rotaAfetada : "",
    report.erroTecnico ? "\nEvidência técnica: " + String(report.erroTecnico).slice(0, 3000) : "",
    "\nOrigem: Suporte (" + report.categoria + ")",
  ].join("").slice(0, 8000);
  const homologUrl = process.env["HOMOLOGATION_URL"] ?? "https://homolog.appvendorai.com";

  await pool.query(
    "INSERT INTO admin_improvements (id,title,description,module,priority,status,source_type,source_ref_id,source_tenant_id,owner_agent,agent_status,created_by,homolog_url) VALUES ($1,$2,$3,'Plataforma',$4,'solicitada','support',$5,$6,'vendi','queued',$7,$8)",
    [improvementId, report.titulo, description, priorityMap[String(report.prioridade)] ?? "media", bugId, report.tenantId, actor(req), homologUrl],
  );
  await pool.query(
    "INSERT INTO admin_improvement_events (id,improvement_id,event_type,message,actor,payload) VALUES ($1,$2,'created_from_support','Demanda criada a partir do suporte.',$3,$4::jsonb)",
    [randomUUID(), improvementId, actor(req), JSON.stringify({ bugId, tenantId: report.tenantId, category: report.categoria })],
  );

  return res.status(201).json({ created: true, improvement: { id: improvementId, title: report.titulo, status: "solicitada" } });
});

router.get("/admin/releases", async (_req, res) => {
  await ensureSchema();
  const releases = await pool.query(
    "SELECT id,version,name,summary,status,improvement_ids AS \"improvementIds\",test_url AS \"testUrl\",test_status AS \"testStatus\",test_summary AS \"testSummary\",impact,approved_by AS \"approvedBy\",approved_at AS \"approvedAt\",scheduled_at AS \"scheduledAt\",started_at AS \"startedAt\",published_at AS \"publishedAt\",duration_ms AS \"durationMs\",release_pr_number AS \"releasePrNumber\",release_pr_url AS \"releasePrUrl\",published_sha AS \"publishedSha\",rollback_version AS \"rollbackVersion\",last_error AS \"lastError\",created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM admin_releases ORDER BY created_at DESC LIMIT 100"
  );
  return res.json({ items: releases.rows });
});

router.post("/admin/releases", async (req, res) => {
  await ensureSchema();
  const parsed = releaseCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const checks = await pool.query(
    "SELECT id,title,module,test_status AS \"testStatus\",pr_number AS \"prNumber\" FROM admin_improvements WHERE id=ANY($1::uuid[])",
    [parsed.data.ids],
  );
  const blocked = checks.rows.filter((row) => row.testStatus !== "passed" || !row.prNumber);
  if (blocked.length || checks.rows.length !== parsed.data.ids.length) {
    return res.status(409).json({ error: "Somente melhorias com testes aprovados e PR vinculado podem entrar numa publicação.", blocked });
  }

  const version = await nextReleaseVersion();
  const candidate = await createReleaseCandidateBranch(version, parsed.data.ids);
  const impact = await collectReleaseImpact(parsed.data.ids, candidate.branch);
  const previous = await pool.query("SELECT version FROM admin_releases WHERE status='published' ORDER BY published_at DESC NULLS LAST LIMIT 1");
  const id = randomUUID();
  const summary = parsed.data.summary || checks.rows.map((row) => row.title).join(" • ").slice(0, 6000);
  const status = impact.clean ? "ready" : "blocked";
  const testUrl = process.env["HOMOLOGATION_URL"] ?? "https://homolog.appvendorai.com";

  await pool.query(
    "INSERT INTO admin_releases (id,version,name,summary,status,improvement_ids,test_url,test_status,impact,base_sha,head_sha,release_branch,rollback_version,created_by) VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7,'pending',$8::jsonb,$9,$10,$11,$12,$13)",
    [id, version, parsed.data.name, summary, status, parsed.data.ids, testUrl, JSON.stringify(impact), impact.base.sha, impact.head.sha, candidate.branch, previous.rows[0]?.version ?? null, actor(req)],
  );
  await pool.query("UPDATE admin_improvements SET package_key=$1,updated_at=now() WHERE id=ANY($2::uuid[])", [version, parsed.data.ids]);
  return res.status(201).json({ id, version, name: parsed.data.name, status, impact, testUrl });
});

router.post("/admin/releases/:id/impact", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  if (["publishing", "monitoring", "published", "rolled_back"].includes(release.status)) return res.status(409).json({ error: "Publicação já está em execução ou concluída." });

  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  const fingerprint = releaseFingerprint(release, impact);
  const changedAfterApproval = Boolean(release.approvalFingerprint && release.approvalFingerprint !== fingerprint);
  const nextStatus = !impact.clean || changedAfterApproval ? "blocked" : release.status === "blocked" ? "ready" : release.status;

  await pool.query(
    "UPDATE admin_releases SET impact=$2::jsonb,base_sha=$3,head_sha=$4,status=$5,approval_fingerprint=CASE WHEN $6 THEN NULL ELSE approval_fingerprint END,approved_by=CASE WHEN $6 THEN NULL ELSE approved_by END,approved_at=CASE WHEN $6 THEN NULL ELSE approved_at END,last_error=CASE WHEN $6 THEN 'Conteúdo da versão mudou depois da aprovação.' WHEN $7 THEN 'Alterações fora do escopo ou itens não prontos foram detectados.' ELSE NULL END,updated_at=now() WHERE id=$1",
    [release.id, JSON.stringify(impact), impact.base.sha, impact.head.sha, nextStatus, changedAfterApproval, !impact.clean],
  );
  return res.json({ impact, changedAfterApproval, status: nextStatus });
});


router.post("/admin/releases/:id/vendi-test", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });

  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  if (!impact.clean) {
    return res.status(409).json({
      error: "O Vendi não pode validar uma versão com impacto inconsistente.",
      impact,
    });
  }

  const baseUrl = String(release.testUrl ?? process.env["HOMOLOGATION_URL"] ?? "").replace(/\/+$/, "");
  if (!baseUrl) return res.status(409).json({ error: "Ambiente de teste não configurado." });
  const startUrl = baseUrl + "/admin/melhorias";
  const host = new URL(startUrl).hostname.toLowerCase();

  const user = req.user as any;
  if (!user?.id && !user?.sub) return res.status(401).json({ error: "Super Admin não identificado." });
  const firstPartyAuthToken = signToken({
    sub: String(user.id ?? user.sub),
    email: String(user.email ?? ""),
    platformRole: "super_admin",
    tenantId: String(user.tenantId ?? ""),
    role: String(user.role ?? "admin"),
    userFunction: user.userFunction ? String(user.userFunction) : undefined,
    actorType: "ai",
  });

  await pool.query(
    "UPDATE admin_releases SET test_status='running',test_summary='Vendi iniciou a validação funcional e visual.',updated_at=now() WHERE id=$1",
    [release.id],
  );

  const goal = [
    "Você é o Vendi validando uma versão de homologação do próprio VendorAI.",
    "Valide SOMENTE leitura e navegação; não crie, aprove, publique, agende, exclua ou salve nada.",
    "Na tela Super Admin > Melhorias & Publicações confirme:",
    "1) título 'Melhorias & Publicações';",
    "2) cards Fazendo, Prontas, Agendadas / em execução, Publicadas e Tempo médio;",
    "3) abas Melhorias e Publicações e navegação entre elas;",
    "4) botão Nova melhoria visível, sem submeter o formulário;",
    "5) lista/tabela sem erro de renderização;",
    "6) na aba Publicações, os controles e estados existentes carregam sem erro;",
    "7) registre textos ausentes, tela quebrada, erro de rota, erro de autenticação ou comportamento inesperado.",
    "Ao final retorne um resumo objetivo dizendo PASSOU ou FALHOU e os achados.",
  ].join("\n");

  try {
    const result = await runBrowserAgent({
      tenantId: String(user.tenantId ?? "platform"),
      goal,
      startUrl,
      mode: "autonomo",
      allowWrite: false,
      maxSteps: 24,
      allowedHosts: [host],
      firstPartyAuthToken,
    });

    const passed = Boolean(result.ok);
    const summary = JSON.stringify({
      verdict: passed ? "passed" : "failed",
      answer: result.answer,
      finalUrl: result.finalUrl,
      steps: result.steps,
      checkedAt: new Date().toISOString(),
    }).slice(0, 12000);

    await pool.query(
      "UPDATE admin_releases SET test_status=$2,test_summary=$3,status=CASE WHEN $2='passed' THEN 'ready' ELSE 'blocked' END,last_error=CASE WHEN $2='passed' THEN NULL ELSE $4 END,updated_at=now() WHERE id=$1",
      [release.id, passed ? "passed" : "failed", summary, passed ? null : String(result.answer ?? "Validação do Vendi falhou.").slice(0, 4000)],
    );

    if (passed) {
      await notifySuperAdminsApprovalRequired({
        title: "Publicação pronta para sua aprovação",
        message: ("A versão " + String(release.version) + " — " + String(release.name) + " passou pela validação da Vendi e está aguardando sua aprovação para produção. Abra Melhorias & Publicações para aprovar ou pedir alteração."),
      });
    }

    return res.status(passed ? 200 : 409).json({
      ok: passed,
      testStatus: passed ? "passed" : "failed",
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na validação do Vendi";
    await pool.query(
      "UPDATE admin_releases SET test_status='failed',test_summary=$2,status='blocked',last_error=$2,updated_at=now() WHERE id=$1",
      [release.id, message.slice(0, 12000)],
    );
    return res.status(409).json({ error: message, testStatus: "failed" });
  }
});

router.post("/admin/releases/:id/tested", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  if (!impact.clean) return res.status(409).json({ error: "Impacto da versão não está limpo.", impact });

  await pool.query(
    "UPDATE admin_releases SET test_status='passed',test_summary='Teste manual confirmado pelo Super Admin.',impact=$2::jsonb,base_sha=$3,head_sha=$4,status='ready',updated_at=now() WHERE id=$1",
    [release.id, JSON.stringify(impact), impact.base.sha, impact.head.sha],
  );
  await notifySuperAdminsApprovalRequired({
    title: "Publicação pronta para sua aprovação",
    message: ("A versão " + String(release.version) + " — " + String(release.name) + " está testada e pronta. Abra Melhorias & Publicações para aprovar a produção ou pedir alteração."),
  });
  return res.json({ ok: true });
});

router.post("/admin/releases/:id/approve", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  if (release.testStatus !== "passed") return res.status(409).json({ error: "Teste da versão ainda não foi confirmado." });

  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  if (!impact.clean) return res.status(409).json({ error: "A publicação possui alterações fora do escopo ou itens não prontos.", impact });

  const fingerprint = releaseFingerprint(release, impact);
  await pool.query(
    "UPDATE admin_releases SET status='scheduled',impact=$2::jsonb,base_sha=$3,head_sha=$4,approval_fingerprint=$5,approved_by=$6,approved_at=now(),scheduled_at=now(),last_error=NULL,updated_at=now() WHERE id=$1",
    [release.id, JSON.stringify(impact), impact.base.sha, impact.head.sha, fingerprint, actor(req)],
  );
  void runReleaseWorker();
  return res.json({
    ok: true,
    status: "scheduled",
    fingerprint,
    approvedBy: actor(req),
    publicationStarted: true,
  });
});

router.post("/admin/releases/:id/schedule", async (req, res) => {
  await ensureSchema();
  const parsed = releaseScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  if (release.status !== "approved" || !release.approvalFingerprint) return res.status(409).json({ error: "A publicação precisa estar aprovada antes de ser agendada." });

  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  const fingerprint = releaseFingerprint(release, impact);
  if (!impact.clean || fingerprint !== release.approvalFingerprint) {
    await pool.query(
      "UPDATE admin_releases SET status='blocked',approval_fingerprint=NULL,approved_by=NULL,approved_at=NULL,last_error=$2,updated_at=now() WHERE id=$1",
      [release.id, "Versão alterada depois da aprovação; nova aprovação necessária."],
    );
    return res.status(409).json({ error: "A versão mudou depois da aprovação. Aprove novamente.", impact });
  }

  const scheduledAt = parsed.data.publishNow ? new Date() : parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return res.status(422).json({ error: "Informe um horário de publicação válido." });
  await pool.query("UPDATE admin_releases SET status='scheduled',scheduled_at=$2,last_error=NULL,updated_at=now() WHERE id=$1", [release.id, scheduledAt]);
  return res.json({ ok: true, scheduledAt, status: "scheduled" });
});

router.post("/admin/releases/:id/cancel", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  if (["publishing", "monitoring", "published", "rolled_back"].includes(release.status)) return res.status(409).json({ error: "Esta publicação não pode mais ser cancelada." });
  await pool.query("UPDATE admin_releases SET status='cancelled',scheduled_at=NULL,updated_at=now() WHERE id=$1", [release.id]);
  return res.json({ ok: true });
});


async function notifySuperAdminsApprovalRequired(params: { title: string; message: string }) {
  const recipients = await pool.query(
    `SELECT id,tenant_id AS "tenantId"
       FROM users
      WHERE active=true
        AND platform_role='super_admin'
        AND tenant_id IS NOT NULL`,
  );
  for (const recipient of recipients.rows) {
    await pool.query(
      `INSERT INTO notifications
         (id,tenant_id,recipient_user_id,title,message,type,category,created_at)
       VALUES ($1,$2,$3,$4,$5,'warning','release_approval_required',now())`,
      [
        randomUUID(),
        String(recipient.tenantId),
        String(recipient.id),
        params.title.slice(0, 180),
        params.message.slice(0, 4000),
      ],
    ).catch(() => undefined);
  }
}

async function notifySupportRequestersAfterPublish(release: any) {
  const linked = await pool.query(
    "SELECT id,title,source_ref_id AS \"sourceRefId\",source_tenant_id AS \"sourceTenantId\" FROM admin_improvements WHERE id=ANY($1::uuid[]) AND source_type='support' AND source_tenant_id IS NOT NULL",
    [release.improvementIds],
  );

  for (const item of linked.rows) {
    const tenantId = String(item.sourceTenantId ?? "");
    if (!tenantId) continue;
    await pool.query(
      "INSERT INTO notifications (id,tenant_id,title,message,type,category,created_at) VALUES ($1,$2,$3,$4,'info','product_improvement',now())",
      [
        randomUUID(),
        tenantId,
        "Melhoria publicada",
        "A solicitação \"" + String(item.title) + "\" foi implementada na versão " + String(release.version) + " — " + String(release.name) + ".",
      ],
    ).catch(() => undefined);

    if (item.sourceRefId) {
      await pool.query(
        "UPDATE bug_reports SET status='resolvido',resolvido_por='dev_ia',resolvido_at=COALESCE(resolvido_at,now()),updated_at=now() WHERE id=$1",
        [String(item.sourceRefId)],
      ).catch(() => undefined);
    }
  }
}

async function executeScheduledRelease(release: any) {
  const impact = await collectReleaseImpact(release.improvementIds, release.releaseBranch ?? "staging");
  const fingerprint = releaseFingerprint(release, impact);
  if (!impact.clean || !release.approvalFingerprint || fingerprint !== release.approvalFingerprint) throw new Error("A versão mudou ou contém alterações fora do escopo aprovado.");

  const config = githubConfig();
  const currentMain = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/main");
  const releaseBranch = String(release.releaseBranch ?? "");
  if (!releaseBranch) throw new Error("Versão candidata sem branch de release.");
  const candidate = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/" + encodeURIComponent(releaseBranch));
  if (String(currentMain.object?.sha ?? "") !== String(impact.base.sha ?? "")) throw new Error("A main mudou desde a aprovação. Nova comparação e aprovação são necessárias.");
  if (String(candidate.object?.sha ?? "") !== String(impact.head.sha ?? "")) throw new Error("A versão candidata mudou desde a aprovação. Nova comparação e aprovação são necessárias.");

  const releaseEvidence = await collectDevAgentCheckEvidence(String(candidate.object.sha));
  if (releaseEvidence.codeFailures.length) {
    throw new Error("A versão possui falhas de código/teste: " + releaseEvidence.codeFailures.map((item) => item.name).join(", "));
  }
  if (releaseEvidence.pending.length) {
    throw new Error("Os testes da versão ainda estão em execução: " + releaseEvidence.pending.map((item) => item.name).join(", "));
  }
  if (!releaseEvidence.successes.length) {
    throw new Error("Nenhum gate técnico concluído com sucesso foi comprovado para a versão.");
  }

  let prNumber = release.releasePrNumber ? Number(release.releasePrNumber) : null;
  let prUrl = release.releasePrUrl ?? null;
  if (!prNumber) {
    const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: ("[Release] " + release.version + " — " + release.name).slice(0, 120),
        body: ("Publicação aprovada pelo Super Admin.\n\nVersão: " + release.version + "\nNome: " + release.name + "\nMelhorias: " + (release.improvementIds ?? []).join(", ") + "\n\nFingerprint: " + release.approvalFingerprint).slice(0, 12000),
        head: releaseBranch,
        base: "main",
        draft: false,
      }),
    });
    prNumber = Number(pr.number);
    prUrl = pr.html_url ?? null;
    await pool.query("UPDATE admin_releases SET release_pr_number=$2,release_pr_url=$3,updated_at=now() WHERE id=$1", [release.id, prNumber, prUrl]);
  }

  const pr = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + prNumber);
  if (pr.mergeable === false || pr.state !== "open" || pr.draft) throw new Error("PR da publicação não está mergeável ou pronto.");
  const merged = await githubJson("/repos/" + config.owner + "/" + config.repo + "/pulls/" + prNumber + "/merge", {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash", sha: pr.head?.sha }),
  });
  if (!merged.merged) throw new Error(merged.message ?? "GitHub não confirmou a publicação.");

  await pool.query(
    "UPDATE admin_releases SET status='monitoring',published_sha=$2,release_pr_number=$3,release_pr_url=$4,last_error=NULL,updated_at=now() WHERE id=$1",
    [release.id, merged.sha ?? null, prNumber, prUrl],
  );
  return { sha: merged.sha ?? null, prNumber, prUrl };
}

// Estado persistente; a tabela é criada exclusivamente por migration, nunca no runtime.
const controlModes = ["running", "paused", "draining"] as const;
const controlSchema = z.object({ mode: z.enum(controlModes), reason: z.string().max(1000).optional() });
async function releaseControl() {
  const result = await pool.query("SELECT mode,updated_at AS \"updatedAt\",updated_by AS \"updatedBy\",reason FROM admin_release_execution_control WHERE id=1");
  if (!result.rowCount) throw new Error("RELEASE_CONTROL_NOT_INITIALIZED");
  return result.rows[0] as { mode: "running" | "paused" | "draining"; updatedAt: string; updatedBy: string; reason: string | null };
}

router.get("/admin/releases/execution-control", async (_req, res) => {
  try { await ensureSchema(); return res.json(await releaseControl()); }
  catch (error) { return res.status(503).json({ error: "RELEASE_CONTROL_UNAVAILABLE" }); }
});

router.post("/admin/releases/execution-control", async (req, res) => {
  const parsed = controlSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  // Fail closed: enabling a worker that can eventually merge/deploy requires
  // a separately configured operator gate, never just a UI click.
  if (parsed.data.mode === "running" &&
      process.env["VENDI_RELEASE_OPERATOR_VALIDATED"] !== "true") {
    return res.status(409).json({
      error: "OPERADOR_CONTABO_NAO_HOMOLOGADO",
      message: "Valide build, migrações, operador e rollback antes de habilitar a fila."
    });
  }
  try {
    await ensureSchema();
    const result = await pool.query(
      "UPDATE admin_release_execution_control SET mode=$1,reason=$2,updated_by=$3,updated_at=now() WHERE id=1 RETURNING mode,reason,updated_by AS \"updatedBy\",updated_at AS \"updatedAt\"",
      [parsed.data.mode, parsed.data.reason ?? null, actor(req)],
    );
    if (!result.rowCount) return res.status(503).json({ error: "RELEASE_CONTROL_NOT_INITIALIZED" });
    return res.json(result.rows[0]);
  } catch { return res.status(503).json({ error: "RELEASE_CONTROL_UNAVAILABLE" }); }
});

// Diagnóstico somente leitura da fila; útil mesmo quando o operador Contabo está indisponível.
router.get("/admin/improvements/queue-diagnostics", async (_req, res) => {
  try {
    await ensureSchema();
    const data = await pool.query(
      `SELECT i.id, i.title, i.module, i.priority, i.agent_status AS "agentStatus",
              i.status,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status))
                FROM admin_improvement_dependencies d
                LEFT JOIN admin_improvements p ON p.id=d.depends_on_id
                WHERE d.improvement_id=i.id
                  AND (p.id IS NULL OR p.status <> 'producao_validada')
              ),'[]'::jsonb) AS blockers
         FROM admin_improvements i
        WHERE i.agent_status IN ('queued','idle','running','needs_attention')
        ORDER BY CASE i.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1
                                WHEN 'media' THEN 2 ELSE 3 END, i.created_at
        LIMIT 100`
    );
    return res.json({
      items: data.rows.map((item) => ({
        ...item,
        eligibility: item.agentStatus === "running" ? "running"
          : item.agentStatus === "needs_attention" ? "needs_attention"
          : item.blockers.length ? "blocked_dependency"
          : ["solicitada", "em_desenvolvimento"].includes(item.status) ? "ready"
          : "waiting_stage",
      })),
      truncated: data.rows.length === 100,
    });
  } catch {
    return res.status(503).json({ error: "QUEUE_DIAGNOSTICS_UNAVAILABLE" });
  }
});

// Vincula itens já registrados na Central aos lotes oficiais sem recriá-los.
// Registro Mestre é a fonte de planejamento; registros operacionais ficam na Central.
const registryLinkSchema = z.object({
  lot: z.string().trim().regex(/^[0-9]{2}$/),
  sublot: z.string().trim().regex(/^[0-9]{2}\.[0-9]{2}$/),
  improvementId: z.string().uuid(),
});
router.get("/admin/improvements/master-registry-links", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT lot,sublot,improvement_id AS \"improvementId\",created_at AS \"createdAt\" FROM admin_improvement_master_links ORDER BY lot,sublot"
    );
    return res.json({ items: result.rows });
  } catch { return res.status(503).json({ error: "MASTER_LINK_SCHEMA_NOT_READY" }); }
});
router.get("/admin/improvements/master-registry-summary", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.lot,count(*)::int AS linked,
              count(*) FILTER (WHERE i.status='producao_validada')::int AS validated,
              count(*) FILTER (WHERE i.agent_status='running')::int AS running,
              count(*) FILTER (WHERE i.status='bloqueada')::int AS blocked
         FROM admin_improvement_master_links m
         JOIN admin_improvements i ON i.id=m.improvement_id
        GROUP BY m.lot ORDER BY m.lot`
    );
    return res.json({ lots: result.rows, coverage: "linked_only", source: "admin_improvement_master_links" });
  } catch { return res.status(503).json({ error: "MASTER_LINK_SCHEMA_NOT_READY" }); }
});
router.post("/admin/improvements/master-registry-links", async (req, res) => {
  const input = registryLinkSchema.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Lote, sublote e melhoria inválidos." });
  if (!input.data.sublot.startsWith(input.data.lot + ".")) return res.status(422).json({ error: "Sublote incompatível com lote." });
  try {
    const found = await pool.query("SELECT id FROM admin_improvements WHERE id=$1", [input.data.improvementId]);
    if (!found.rowCount) return res.status(404).json({ error: "Melhoria não encontrada." });
    const result = await pool.query(
      "INSERT INTO admin_improvement_master_links (lot,sublot,improvement_id) VALUES ($1,$2,$3) ON CONFLICT (lot,sublot) DO UPDATE SET improvement_id=EXCLUDED.improvement_id RETURNING lot,sublot,improvement_id AS \"improvementId\"",
      [input.data.lot,input.data.sublot,input.data.improvementId]
    );
    return res.json({ ok: true, item: result.rows[0] });
  } catch { return res.status(503).json({ error: "MASTER_LINK_UPDATE_FAILED" }); }
});

// Dependências da fila existente; a mudança é transacional e recusa ciclos.
const dependencySchema = z.object({ dependsOnId: z.string().uuid() });
router.get("/admin/improvements/:id/dependencies", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "ID inválido" });
  try {
    const result = await pool.query(
      "SELECT d.depends_on_id AS \"dependsOnId\",i.title,i.status FROM admin_improvement_dependencies d JOIN admin_improvements i ON i.id=d.depends_on_id WHERE d.improvement_id=$1 ORDER BY i.created_at",
      [req.params.id],
    );
    return res.json({ items: result.rows });
  } catch { return res.status(503).json({ error: "DEPENDENCY_SCHEMA_NOT_READY" }); }
});
router.post("/admin/improvements/:id/dependencies", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const body = dependencySchema.safeParse(req.body);
  if (!id.success || !body.success) return res.status(422).json({ error: "IDs inválidos" });
  if (id.data === body.data.dependsOnId) return res.status(409).json({ error: "Dependência circular" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [731003]);
    const nodes = await client.query("SELECT id FROM admin_improvements WHERE id IN ($1,$2)", [id.data, body.data.dependsOnId]);
    if (nodes.rowCount !== 2) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Melhoria não encontrada" }); }
    const cycle = await client.query(
      "WITH RECURSIVE ancestors(id) AS (SELECT depends_on_id FROM admin_improvement_dependencies WHERE improvement_id=$1 UNION SELECT d.depends_on_id FROM admin_improvement_dependencies d JOIN ancestors a ON a.id=d.improvement_id) SELECT 1 FROM ancestors WHERE id=$2 LIMIT 1",
      [body.data.dependsOnId,id.data],
    );
    if (cycle.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Dependência circular" }); }
    await client.query("INSERT INTO admin_improvement_dependencies (improvement_id,depends_on_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id.data,body.data.dependsOnId]);
    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return res.status(503).json({ error: "DEPENDENCY_UPDATE_FAILED" });
  } finally { client.release(); }
});
router.delete("/admin/improvements/:id/dependencies/:dependsOnId", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const dep = z.string().uuid().safeParse(req.params.dependsOnId);
  if (!id.success || !dep.success) return res.status(422).json({ error: "IDs inválidos" });
  try {
    await pool.query("DELETE FROM admin_improvement_dependencies WHERE improvement_id=$1 AND depends_on_id=$2", [id.data,dep.data]);
    return res.json({ ok: true });
  } catch { return res.status(503).json({ error: "DEPENDENCY_UPDATE_FAILED" }); }
});

const RELEASE_WORKER_LOCK = 731001;
const GITHUB_RECONCILE_WORKER_LOCK = 731002;

async function withWorkerAdvisoryLock(lockKey: number, fn: () => Promise<void>) {
  const client = await pool.connect();
  let acquired = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [lockKey]);
    acquired = Boolean(lock.rows[0]?.acquired);
    if (!acquired) return false;
    await fn();
    return true;
  } finally {
    if (acquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => undefined);
    }
    client.release();
  }
}

let workerStarted = false;
let workerRunning = false;
let githubReconcileRunning = false;

async function runGithubReconcileWorker() {
  if (githubReconcileRunning) return;
  githubReconcileRunning = true;
  try {
    await withWorkerAdvisoryLock(GITHUB_RECONCILE_WORKER_LOCK, async () => {
      await ensureSchema();
      await reconcileGithubImprovements("vendi:worker");
    });
  } catch (error) {
    console.error("[github-reconcile-worker] cycle failed:", error instanceof Error ? error.message : error);
  } finally {
    githubReconcileRunning = false;
  }
}

async function runReleaseWorkerCycle() {
  try {
    await ensureSchema();

    const execution = await releaseControl();
    if (execution.mode === "running" && fullAutonomyEnabled()) {
      await quarantineInterruptedImprovements().catch((error) => {
        console.error("[release-worker] interrupted task quarantine failed:", error instanceof Error ? error.message : error);
      });
      await repairAutonomousBlockedImprovement().catch((error) => {
        console.error("[release-worker] autonomous repair failed:", error instanceof Error ? error.message : error);
      });
      await advanceAutonomousImprovement().catch((error) => {
        console.error("[release-worker] autonomous development failed:", error instanceof Error ? error.message : error);
      });
      await refreshAutonomousImprovementChecks().catch((error) => {
        console.error("[release-worker] autonomous checks failed:", error instanceof Error ? error.message : error);
      });
      await createAutonomousReleaseIfReady().catch((error) => {
        console.error("[release-worker] autonomous package failed:", error instanceof Error ? error.message : error);
      });
      await advanceAutonomousRelease().catch((error) => {
        console.error("[release-worker] autonomous validation failed:", error instanceof Error ? error.message : error);
      });
    }
    const allowPublishing = execution.mode === "running";
    const queueBlock = await pool.query(
      "SELECT id,status FROM admin_releases WHERE status IN ('publishing','monitoring') OR (status='blocked' AND scheduled_at IS NOT NULL) ORDER BY updated_at DESC LIMIT 1"
    );
    const claim = !allowPublishing || queueBlock.rowCount
      ? { rows: [] as any[] }
      : await pool.query(
          "WITH control AS (SELECT mode FROM admin_release_execution_control WHERE id=1 FOR SHARE), candidate AS (SELECT id FROM admin_releases WHERE status='scheduled' AND scheduled_at<=now() AND EXISTS (SELECT 1 FROM control WHERE mode='running') ORDER BY scheduled_at ASC,created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE admin_releases r SET status='publishing',started_at=now(),last_error=NULL,updated_at=now() FROM candidate c WHERE r.id=c.id RETURNING r.id"
        );
    const claimedId = claim.rows[0]?.id;
    if (claimedId) {
      const release = await getReleaseById(String(claimedId));
      if (release) {
        try {
          await executeScheduledRelease(release);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha na publicação";
          await pool.query(
            "UPDATE admin_releases SET status='blocked',last_error=$2,approval_fingerprint=NULL,approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=$1",
            [release.id, message.slice(0, 12000)],
          );
        }
      }
    }

    const monitoring = await pool.query(
      "SELECT id,published_sha AS \"publishedSha\",started_at AS \"startedAt\" FROM admin_releases WHERE status='monitoring' AND published_sha IS NOT NULL ORDER BY started_at ASC LIMIT 3"
    );
    for (const row of monitoring.rows) {
      try {
        const validation = await validateProductionRevision(String(row.publishedSha));
        if (validation.state !== "validated") continue;
        const durationMs = row.startedAt ? Math.max(0, Date.now() - new Date(row.startedAt).getTime()) : null;
        await pool.query(
          "UPDATE admin_releases SET status='published',published_at=now(),duration_ms=$2,last_error=NULL,updated_at=now() WHERE id=$1",
          [row.id, durationMs],
        );
        const release = await getReleaseById(String(row.id));
        if (release) {
          await pool.query(
            "UPDATE admin_improvements SET status='producao_validada',production_url=COALESCE(production_url,$2),updated_at=now() WHERE id=ANY($1::uuid[])",
            [release.improvementIds, process.env["PRODUCTION_URL"] ?? "https://app.appvendorai.com"],
          );
          await notifySupportRequestersAfterPublish(release);
        }
      } catch {
        // A validação continua no próximo ciclo.
      }
    }
  } catch (error) {
    // O worker de publicações é auxiliar e não pode derrubar a API inteira
    // quando o usuário runtime do banco não possui DDL no schema public.
    console.error("[release-worker] ciclo ignorado:", error instanceof Error ? error.message : error);
  }
}

async function runReleaseWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await withWorkerAdvisoryLock(RELEASE_WORKER_LOCK, async () => {
      await runReleaseWorkerCycle();
    });
  } catch (error) {
    console.error("[release-worker] lock/cycle failed:", error instanceof Error ? error.message : error);
  } finally {
    workerRunning = false;
  }
}

function startReleaseWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const releaseTimer = setInterval(() => { void runReleaseWorker(); }, 30000);
  releaseTimer.unref();

  const reconcileTimer = setInterval(() => { void runGithubReconcileWorker(); }, 300000);
  reconcileTimer.unref();

  void runReleaseWorker();
  const initialReconcile = setTimeout(() => { void runGithubReconcileWorker(); }, 10000);
  initialReconcile.unref();
}

startReleaseWorker();

router.post("/admin/releases/:id/execute", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  if (release.status !== "approved") return res.status(409).json({ error: "A publicação precisa estar aprovada." });
  await pool.query("UPDATE admin_releases SET status='scheduled',scheduled_at=now(),updated_at=now() WHERE id=$1", [release.id]);
  void runReleaseWorker();
  return res.json({ ok: true, status: "scheduled" });
});

router.post("/admin/releases/:id/rollback", async (req, res) => {
  await ensureSchema();
  const release = await getReleaseById(String(req.params.id));
  if (!release) return res.status(404).json({ error: "Publicação não encontrada" });
  if (release.status !== "published" || !release.publishedSha) return res.status(409).json({ error: "Rollback só é permitido para uma publicação concluída." });

  const config = githubConfig();
  const mainRef = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/ref/heads/main");
  const currentMainSha = String(mainRef.object?.sha ?? "");
  if (currentMainSha !== String(release.publishedSha)) return res.status(409).json({ error: "Existem publicações posteriores. Rollback direto desta versão foi bloqueado." });

  const publishedCommit = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/commits/" + encodeURIComponent(release.publishedSha));
  const parentSha = String(publishedCommit.parents?.[0]?.sha ?? "");
  if (!parentSha) return res.status(409).json({ error: "Commit anterior não encontrado para rollback." });
  const parentCommit = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/commits/" + encodeURIComponent(parentSha));
  const rollbackCommit = await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: "rollback: " + release.version + " — " + release.name,
      tree: parentCommit.tree?.sha,
      parents: [currentMainSha],
    }),
  });
  await githubJson("/repos/" + config.owner + "/" + config.repo + "/git/refs/heads/main", {
    method: "PATCH",
    body: JSON.stringify({ sha: rollbackCommit.sha, force: false }),
  });

  await pool.query(
    "UPDATE admin_releases SET status='rolled_back',last_error=$2,updated_at=now() WHERE id=$1",
    [release.id, "Rollback autorizado por " + actor(req) + "; revisão " + rollbackCommit.sha + "."],
  );
  return res.json({ ok: true, rollbackSha: rollbackCommit.sha, previousSha: parentSha });
});

router.get("/admin/releases-metrics", async (_req, res) => {
  await ensureSchema();
  const result = await pool.query(
    "SELECT count(*) FILTER (WHERE status='scheduled')::int AS scheduled,count(*) FILTER (WHERE status IN ('publishing','monitoring'))::int AS running,count(*) FILTER (WHERE status='blocked')::int AS blocked,avg(duration_ms) FILTER (WHERE status='published' AND duration_ms IS NOT NULL) AS avg_duration_ms FROM (SELECT * FROM admin_releases ORDER BY published_at DESC NULLS LAST LIMIT 10) recent"
  );
  return res.json(result.rows[0] ?? { scheduled: 0, running: 0, blocked: 0, avg_duration_ms: null });
});

export default router;
