import { Router } from "express";
import { z } from "zod/v4";
import {
  loadExecutionMemory,
  recordExecutionMemory,
  type ExecutionMemoryEntry,
} from "./dev_agent_memory";

const router = Router();

const rollbackSchema = z.object({
  requestId: z.string().min(1).max(120),
  mergeSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  reason: z.string().max(1200).optional().default("Regressão confirmada após deploy."),
});

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, repository, owner, repo };
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
      "User-Agent": "VendorAI-Dev-Recovery/1.1",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) {
    const error = new Error(data?.message ?? `GitHub HTTP ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }
  return data;
}

function sanitizeTechnicalText(value: unknown) {
  return String(value ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[uuid]")
    .replace(/\b(?:sk-|ghp_|github_pat_|eyJ)[A-Za-z0-9._-]{16,}\b/g, "[credencial]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[valor-redigido]")
    .slice(0, 1200);
}

function isSystemExecutionMemory(entry: ExecutionMemoryEntry) {
  const status = entry.status.toLowerCase();
  const engines = entry.engines.map((engine) => engine.toLowerCase());
  return status.includes("incident")
    || status.includes("recovered")
    || engines.some((engine) => engine.includes("sentinel") || engine.includes("server-runtime"));
}

function shaMatches(a: string | undefined, b: string) {
  if (!a) return false;
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.startsWith(right) || right.startsWith(left);
}

async function resolveCommit(sha: string) {
  const { owner, repo } = githubConfig();
  const commit = await gh(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`);
  return {
    sha: String(commit.sha),
    url: String(commit.html_url ?? ""),
    parents: Array.isArray(commit.parents) ? commit.parents.map((parent: any) => String(parent.sha)) : [],
    message: String(commit.commit?.message ?? "").split("\n")[0].slice(0, 220),
  };
}

async function currentMainHead() {
  const { owner, repo } = githubConfig();
  const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/main`);
  return String(ref?.object?.sha ?? "");
}

async function gitCommit(sha: string) {
  const { owner, repo } = githubConfig();
  const commit = await gh(`/repos/${owner}/${repo}/git/commits/${encodeURIComponent(sha)}`);
  return {
    sha: String(commit.sha ?? sha),
    treeSha: String(commit.tree?.sha ?? ""),
  };
}

async function existingBranch(branch: string) {
  const { owner, repo } = githubConfig();
  try {
    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, "/")}`);
    return String(ref?.object?.sha ?? "");
  } catch (error) {
    if ((error as any)?.status === 404) return null;
    throw error;
  }
}

function findOwnedExecution(memory: ExecutionMemoryEntry[], sha: string) {
  return [...memory]
    .reverse()
    .find((entry) => !isSystemExecutionMemory(entry) && shaMatches(entry.mergeSha, sha) && entry.changedFiles.length > 0) ?? null;
}

async function prepareRollback(args: z.infer<typeof rollbackSchema>) {
  const { owner, repo, repository } = githubConfig();
  const badCommit = await resolveCommit(args.mergeSha);
  const mainHead = await currentMainHead();
  const safeReason = sanitizeTechnicalText(args.reason) || "Regressão confirmada após deploy.";

  if (mainHead !== badCommit.sha) {
    return {
      ok: false as const,
      status: "rollback_stale" as const,
      error: "Rollback automático seguro bloqueado: o SHA informado não é mais o HEAD atual da main. Prepare uma correção/reversão contextual para não apagar mudanças posteriores.",
      mainHead,
      requestedSha: badCommit.sha,
    };
  }

  if (badCommit.parents.length !== 1) {
    return {
      ok: false as const,
      status: "rollback_unsupported" as const,
      error: "Rollback automático seguro suporta somente commit com exatamente um pai.",
      requestedSha: badCommit.sha,
    };
  }

  const executionMemory = await loadExecutionMemory(25);
  const owned = findOwnedExecution(executionMemory, badCommit.sha);
  if (!owned) {
    return {
      ok: false as const,
      status: "rollback_not_owned" as const,
      error: "Rollback automático seguro bloqueado: não há memória comprovando que este SHA pertence a uma execução do próprio Dev IA.",
      requestedSha: badCommit.sha,
    };
  }

  const parentSha = badCommit.parents[0];
  const parent = await gitCommit(parentSha);
  if (!parent.treeSha) throw new Error("Não foi possível resolver a árvore do commit pai.");

  const branch = `dev-ia/rollback-${badCommit.sha.slice(0, 10)}`;
  const existing = await existingBranch(branch);
  if (existing) {
    return {
      ok: false as const,
      status: "rollback_already_prepared" as const,
      error: `Já existe uma branch de rollback para este SHA: ${branch}`,
      branch,
      branchSha: existing,
      requestedSha: badCommit.sha,
    };
  }

  const rollbackCommit = await gh(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `revert(dev-ia): rollback seguro de ${badCommit.sha.slice(0, 10)}\n\nMotivo: ${safeReason.slice(0, 1000)}`,
      tree: parent.treeSha,
      parents: [badCommit.sha],
    }),
  });
  const rollbackSha = String(rollbackCommit.sha ?? "");
  if (!rollbackSha) throw new Error("GitHub não retornou o SHA do commit de rollback.");

  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: rollbackSha }),
  });

  const pr = await gh(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `Rollback seguro: ${badCommit.message || badCommit.sha.slice(0, 10)}`.slice(0, 120),
      head: branch,
      base: "main",
      draft: false,
      body: [
        "## Origem",
        "Rollback preparado pelo Dev IA após sinal de regressão pós-deploy.",
        "",
        `- SHA alvo: \`${badCommit.sha}\``,
        `- SHA pai/restauração: \`${parentSha}\``,
        `- Execução original: \`${sanitizeTechnicalText(owned.requestId)}\``,
        `- Motivo: ${safeReason}`,
        "",
        "## Guardrails",
        "- nenhum force-push/reset da main;",
        "- este PR apenas restaura a árvore do pai do último commit;",
        "- merge deve passar pelos mesmos gates/revisão do VendorAI;",
        "- se a main avançar antes do merge, reavaliar antes de prosseguir;",
        "- arquivos críticos continuam sujeitos à política de aprovação humana.",
      ].join("\n").slice(0, 12000),
    }),
  });

  await recordExecutionMemory({
    requestId: args.requestId,
    route: owned.route || "/admin/dev-engineering",
    recordedAt: new Date().toISOString(),
    status: "rollback_prepared",
    summary: `Dev IA preparou rollback seguro do SHA ${badCommit.sha.slice(0, 12)} em PR #${Number(pr.number)}; nenhuma alteração foi aplicada diretamente à main.`,
    pullRequestNumber: Number(pr.number),
    mergeSha: badCommit.sha,
    changedFiles: owned.changedFiles,
    engines: ["safe-rollback-controller"],
    failures: [],
    evidence: [
      `repository=${repository}`,
      `main_head=${mainHead.slice(0, 12)}`,
      `target_sha=${badCommit.sha.slice(0, 12)}`,
      `parent_sha=${parentSha.slice(0, 12)}`,
      `rollback_commit=${rollbackSha.slice(0, 12)}`,
      `rollback_pr=${Number(pr.number)}`,
    ],
  }).catch(() => undefined);

  return {
    ok: true as const,
    status: "rollback_prepared" as const,
    branch,
    rollbackSha,
    requestedSha: badCommit.sha,
    parentSha,
    pullRequest: {
      number: Number(pr.number),
      url: String(pr.html_url ?? ""),
      state: String(pr.state ?? "open"),
    },
    originalExecution: {
      requestId: owned.requestId,
      route: owned.route,
      changedFiles: owned.changedFiles,
    },
  };
}

router.post("/support/dev/prepare-rollback", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode preparar rollback do Dev IA." });
  }
  const parsed = rollbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });

  try {
    const result = await prepareRollback(parsed.data);
    if (!result.ok) {
      const code = result.status === "rollback_stale" ? 409 : 422;
      return res.status(code).json({ success: false, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia safe rollback preparation failed");
    return res.status(500).json({ error: "Falha ao preparar rollback seguro do Dev IA" });
  }
});

export default router;
