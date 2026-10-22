import { Router } from "express";
import { z } from "zod/v4";
import * as ts from "typescript";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import cognitionRouter from "./dev_agent_cognition";
import plannerReviewerRouter, { createExecutionPlan, reviewPullRequestForMerge } from "./dev_agent_planner_reviewer";
import specialistsRouter, { createSpecialistCouncil } from "./dev_agent_specialists";

const router = Router();
router.use(cognitionRouter);
router.use(plannerReviewerRouter);
router.use(specialistsRouter);

const executeSchema = z.object({
  requestId: z.string().uuid(),
  request: z.string().min(1).max(12000),
  diagnosis: z.string().max(20000).optional().default(""),
  route: z.string().min(1).max(500),
});

const CRITICAL_PATH_PATTERNS = [
  /(^|\/)migrations?\//i,
  /(^|\/)schema\.(ts|sql)$/i,
  /(^|\/)auth/i,
  /billing/i,
  /payment/i,
  /subscription/i,
  /secrets?/i,
  /\.github\/workflows/i,
  /railway/i,
  /vercel/i,
  /terraform/i,
  /docker/i,
  /rls/i,
  /(^|\/)\.env/i,
];

const CREATABLE_TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md", ".txt", ".html", ".svg",
]);

const VENDORAI_VERCEL_CONTEXTS = new Set([
  "vendorai-platform-replit-frontend",
  "vendorai-platform-replit-website",
  "tad-vendorai",
]);

const BACKEND_PATH_PATTERNS = [
  /^artifacts\/api-server\//i,
  /^lib\/db\//i,
  /^backend\//i,
];

const EXECUTOR_PRIMARY_MODEL = process.env["DEV_IA_EXECUTOR_MODEL"]?.trim() || "gpt-5.6-terra";
const EXECUTOR_FALLBACK_MODEL = process.env["DEV_IA_EXECUTOR_FALLBACK_MODEL"]?.trim() || "gpt-4o-mini";

const AUTONOMY_SYSTEM_PROMPT = `Você é o executor autônomo do Dev IA da plataforma VendorAI.

Sua missão é transformar pedidos técnicos aprovados em trabalho real no repositório, usando as ferramentas disponíveis.

REGRAS OBRIGATÓRIAS:
- O PLANO DE ENGENHARIA recebido é obrigatório. Não improvise escopo fora dele.
- O PARECER DO CONSELHO DE ESPECIALISTAS recebido também é obrigatório e deve orientar riscos e validação.
- Trabalhe somente no repositório configurado do VendorAI.
- Nunca altere main/master diretamente.
- Para mudança de código: pesquise, leia os arquivos necessários, crie uma branch dev-ia/<slug>, ESCREVA o código necessário com patch_file/update_file/create_file, revise o diff da branch, execute preflight_branch, corrija todos os achados determinísticos e só então crie PR e verifique o status.
- Prefira patch_file para uma alteração local e inequívoca; use update_file quando a transformação exigir o arquivo completo; use create_file somente quando não existir fluxo equivalente.
- Se plan.shouldExecute=true, pesquisar, diagnosticar ou explicar NÃO conta como execução concluída. Você deve efetivamente escrever código quando a mudança autorizada exigir código.
- Uma execução de código só pode ser considerada concluída depois de ao menos uma escrita bem-sucedida e da abertura de um PR da branch dev-ia/ para main.
- Antes de criar arquivo novo, procure se já existe fluxo/componente equivalente. Só crie arquivo quando o plano realmente exigir e não houver alternativa coerente existente.
- Faça mudanças pequenas, reversíveis e coerentes com a arquitetura existente.
- Não crie módulos paralelos quando já existir fluxo equivalente.
- Nunca delete arquivos ou dados.
- Não tente contornar bloqueios de segurança retornados pelas ferramentas.
- Mudanças em autenticação, billing/pagamentos, migrations/schema/RLS, segredos, workflows CI/CD ou infraestrutura são consideradas críticas e devem parar em approval_required.
- Para merge automático, considere somente os gates relevantes do VendorAI: Vercel para frontend/previews e revisão adversarial independente. O GitHub-hosted API CI não é autoridade enquanto estiver sem runner.
- Mudanças de backend, após merge, obrigatoriamente ficam em aguardando validação Railway até o SHA publicado ser comprovado. Nunca chame merge de deploy concluído.
- Quando o Planner autorizou execução, a primeira etapa deve usar uma ferramenta real do repositório. Não encerre como concluído sem evidência de ação real.
- Quando o plano pedir teste de regressão e houver padrão de testes existente no módulo, escreva ou ajuste o teste junto com o código antes do PR.
- Nunca diga que algo foi publicado/validado se não houver evidência.
- Se a solicitação for apenas pergunta, auditoria ou diagnóstico sem necessidade de código, não faça alteração.

Ao terminar, responda de forma curta com: o que encontrou, o que escreveu/alterou, branch/PR se criados, estado dos gates relevantes e qualquer bloqueio.`;

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
      "User-Agent": "VendorAI-Dev-Agent/3.5",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

function normalizeBranch(input: string) {
  const branch = input.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._/-]/g, "-");
  if (!branch.startsWith("dev-ia/")) throw new Error("A branch do Dev IA deve começar com dev-ia/");
  if (branch === "dev-ia/" || branch.length > 120) throw new Error("Nome de branch inválido");
  return branch;
}

function assertSafePath(path: string, allowRoot = false) {
  if ((!allowRoot && !path) || path.startsWith("/") || path.includes("..")) throw new Error("Caminho inválido");
}

function assertEditablePath(path: string) {
  assertSafePath(path);
  if (CRITICAL_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
    const error = new Error(`approval_required: alteração crítica bloqueada em ${path}`);
    (error as any).code = "APPROVAL_REQUIRED";
    throw error;
  }
}

function assertCreatablePath(path: string) {
  assertEditablePath(path);
  const slash = path.lastIndexOf("/");
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  if (!filename || filename.startsWith(".")) throw new Error("Criação autônoma de arquivo oculto não é permitida");
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (!CREATABLE_TEXT_EXTENSIONS.has(extension)) throw new Error(`Extensão não permitida para criação autônoma: ${extension || "sem extensão"}`);
}

function isBackendPath(path: string) {
  return BACKEND_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function normalizeVercelContext(value: unknown) {
  return String(value ?? "").replace(/^Vercel\s*[–-]\s*/i, "").trim();
}

function evaluateVendorAiReleaseGate(statuses: any[]) {
  const checks = (statuses ?? []).map((item: any) => ({
    context: normalizeVercelContext(item?.context),
    rawContext: String(item?.context ?? ""),
    state: String(item?.state ?? "pending"),
    targetUrl: item?.target_url ?? null,
  }));
  const relevant = checks.filter((item) => VENDORAI_VERCEL_CONTEXTS.has(item.context));
  const blocking = relevant.filter((item) => item.state !== "success");
  return {
    state: relevant.length > 0 && blocking.length === 0 ? "success" : "pending",
    relevant,
    blocking,
    ignored: checks.filter((item) => !VENDORAI_VERCEL_CONTEXTS.has(item.context)),
  };
}

async function searchCode(query: string) {
  const { repository } = githubConfig();
  const q = encodeURIComponent(`${query} repo:${repository}`);
  const data = await gh(`/search/code?q=${q}&per_page=8`);
  return { total: data.total_count ?? 0, items: (data.items ?? []).slice(0, 8).map((item: any) => ({ path: item.path, name: item.name, url: item.html_url })) };
}

async function getFile(path: string, ref = "main") {
  const { owner, repo } = githubConfig();
  assertSafePath(path);
  const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`);
  if (data.type !== "file" || typeof data.content !== "string") throw new Error("Arquivo não encontrado ou não é arquivo de texto");
  const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  if (content.length > 120000) throw new Error("Arquivo grande demais para edição autônoma");
  return { path, ref, sha: data.sha, content };
}

async function listDirectory(path = "", ref = "main") {
  const { owner, repo } = githubConfig();
  assertSafePath(path, true);
  const encodedPath = path ? `/${encodeURIComponent(path).replace(/%2F/g, "/")}` : "";
  const data = await gh(`/repos/${owner}/${repo}/contents${encodedPath}?ref=${encodeURIComponent(ref)}`);
  if (!Array.isArray(data)) throw new Error("Caminho não é um diretório");
  return { path: path || "/", ref, items: data.slice(0, 100).map((item: any) => ({ type: item.type, name: item.name, path: item.path, size: Number(item.size ?? 0) })), truncated: data.length > 100 };
}

async function createBranch(branchInput: string) {
  const { owner, repo } = githubConfig();
  const branch = normalizeBranch(branchInput);
  const base = await gh(`/repos/${owner}/${repo}/git/ref/heads/main`);
  try {
    await gh(`/repos/${owner}/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }) });
    return { branch, created: true, baseSha: base.object.sha };
  } catch (error) {
    if (error instanceof Error && /Reference already exists/i.test(error.message)) return { branch, created: false, alreadyExists: true };
    throw error;
  }
}

async function updateFile(args: { path: string; content: string; branch: string; message: string }) {
  const { owner, repo } = githubConfig();
  const branch = normalizeBranch(args.branch);
  assertEditablePath(args.path);
  if (args.content.length > 120000) throw new Error("Conteúdo grande demais para edição autônoma");
  const existing = await getFile(args.path, branch);
  const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({ message: args.message.slice(0, 120), content: Buffer.from(args.content, "utf8").toString("base64"), sha: existing.sha, branch }),
  });
  return { path: args.path, branch, commitSha: data.commit?.sha, contentSha: data.content?.sha, created: false };
}

async function patchFile(args: { path: string; oldText: string; newText: string; branch: string; message: string }) {
  const { owner, repo } = githubConfig();
  const branch = normalizeBranch(args.branch);
  assertEditablePath(args.path);
  if (!args.oldText) throw new Error("patch_file exige oldText não vazio");
  const existing = await getFile(args.path, branch);
  const occurrences = existing.content.split(args.oldText).length - 1;
  if (occurrences !== 1) throw new Error(`patch_file exige correspondência única; encontrou ${occurrences} ocorrências. Refine oldText ou use update_file.`);
  const content = existing.content.replace(args.oldText, args.newText);
  if (content.length > 120000) throw new Error("Conteúdo resultante grande demais para edição autônoma");
  const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({ message: args.message.slice(0, 120), content: Buffer.from(content, "utf8").toString("base64"), sha: existing.sha, branch }),
  });
  return { path: args.path, branch, commitSha: data.commit?.sha, contentSha: data.content?.sha, created: false, mode: "surgical_patch", replacedOccurrences: 1 };
}

async function createFile(args: { path: string; content: string; branch: string; message: string }) {
  const { owner, repo } = githubConfig();
  const branch = normalizeBranch(args.branch);
  assertCreatablePath(args.path);
  if (args.content.length > 120000) throw new Error("Conteúdo grande demais para criação autônoma");
  try {
    await getFile(args.path, branch);
    throw new Error("Arquivo já existe; use update_file em vez de create_file");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/not found|arquivo não encontrado/i.test(message)) throw error;
  }
  const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({ message: args.message.slice(0, 120), content: Buffer.from(args.content, "utf8").toString("base64"), branch }),
  });
  return { path: args.path, branch, commitSha: data.commit?.sha, contentSha: data.content?.sha, created: true };
}

async function compareBranch(branchInput: string) {
  const { owner, repo } = githubConfig();
  const branch = normalizeBranch(branchInput);
  const data = await gh(`/repos/${owner}/${repo}/compare/main...${encodeURIComponent(branch).replace(/%2F/g, "/")}`);
  return {
    branch,
    status: String(data.status ?? "unknown"),
    aheadBy: Number(data.ahead_by ?? 0),
    behindBy: Number(data.behind_by ?? 0),
    totalCommits: Number(data.total_commits ?? 0),
    files: (Array.isArray(data.files) ? data.files : []).slice(0, 50).map((file: any) => ({ path: String(file.filename ?? ""), status: String(file.status ?? "modified"), additions: Number(file.additions ?? 0), deletions: Number(file.deletions ?? 0), changes: Number(file.changes ?? 0), patch: typeof file.patch === "string" ? file.patch.slice(0, 5000) : undefined })),
  };
}

function preflightDiagnosticText(diagnostic: ts.Diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").slice(0, 500);
  if (!diagnostic.file || typeof diagnostic.start !== "number") return message;
  const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `linha ${pos.line + 1}, coluna ${pos.character + 1}: ${message}`;
}

async function preflightBranch(branchInput: string) {
  const branch = normalizeBranch(branchInput);
  const diff = await compareBranch(branch);
  const findings: Array<{ severity: "high"; title: string; detail: string; file?: string }> = [];

  if (!diff.files.length || diff.aheadBy < 1) {
    findings.push({ severity: "high", title: "Branch sem mudanças", detail: "A branch precisa conter pelo menos um commit com alterações antes do preflight." });
  }
  if (diff.behindBy > 0) {
    findings.push({ severity: "high", title: "Branch atrasada em relação à main", detail: `A branch está ${diff.behindBy} commit(s) atrás da main e deve ser reaplicada antes de abrir PR.` });
  }
  if (diff.files.length > 30) {
    findings.push({ severity: "high", title: "Mudança grande demais para PR autônomo", detail: `A branch altera ${diff.files.length} arquivos; o limite seguro do Dev IA é 30.` });
  }

  for (const file of diff.files.filter((item: any) => item.status !== "removed")) {
    if (findings.length >= 12) break;
    const path = String(file.path ?? "");
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i.test(path)) continue;

    let content = "";
    try {
      content = (await getFile(path, branch)).content;
    } catch (error) {
      findings.push({ severity: "high", title: "Arquivo não pôde ser validado", detail: error instanceof Error ? error.message.slice(0, 500) : "falha de leitura", file: path });
      continue;
    }

    if (/^(<{7}|={7}|>{7})/m.test(content)) {
      findings.push({ severity: "high", title: "Marcador de conflito encontrado", detail: "O arquivo contém marcador de conflito Git e deve ser corrigido antes do PR.", file: path });
      continue;
    }

    if (/\.json$/i.test(path)) {
      try {
        JSON.parse(content);
      } catch (error) {
        findings.push({ severity: "high", title: "JSON inválido", detail: error instanceof Error ? error.message.slice(0, 500) : "Falha de parse JSON", file: path });
      }
      continue;
    }

    const transpiled = ts.transpileModule(content, {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        allowJs: true,
      },
    });
    const errors = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).slice(0, 4);
    for (const diagnostic of errors) {
      findings.push({ severity: "high", title: "Erro sintático detectado", detail: preflightDiagnosticText(diagnostic), file: path });
      if (findings.length >= 12) break;
    }
  }

  return {
    branch,
    passed: findings.length === 0,
    findings,
    aheadBy: diff.aheadBy,
    behindBy: diff.behindBy,
    totalCommits: diff.totalCommits,
    changedFiles: diff.files.map((file: any) => file.path),
  };
}

async function createPullRequest(args: { title: string; body: string; head: string; base?: "main" | "staging" }) {
  const { owner, repo } = githubConfig();
  const head = normalizeBranch(args.head);
  const base = args.base ?? "main";
  const preflight = await preflightBranch(head);
  if (!preflight.passed) {
    const summary = preflight.findings.slice(0, 6).map((item) => `${item.title}${item.file ? ` (${item.file})` : ""}: ${item.detail}`).join("; ");
    const error = new Error(`pre_pr_preflight_failed: ${summary || "A branch não passou pelo preflight determinístico."}`);
    (error as any).code = "PRE_PR_PREFLIGHT_FAILED";
    (error as any).preflight = preflight;
    throw error;
  }
  const data = await gh(`/repos/${owner}/${repo}/pulls`, { method: "POST", body: JSON.stringify({ title: args.title.slice(0, 120), body: args.body.slice(0, 12000), head, base, draft: false }) });
  return { number: data.number, url: data.html_url, headSha: data.head?.sha, mergeable: data.mergeable, changedFiles: preflight.changedFiles, preflight: { passed: true, checkedAt: new Date().toISOString() } };
}

async function getPullRequest(number: number) {
  const { owner, repo } = githubConfig();
  const pr = await gh(`/repos/${owner}/${repo}/pulls/${number}`);
  const files = await gh(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
  const status = await gh(`/repos/${owner}/${repo}/commits/${pr.head.sha}/status`);
  const changedFiles = (files ?? []).map((file: any) => String(file.filename));
  const criticalFiles = changedFiles.filter((path: string) => CRITICAL_PATH_PATTERNS.some((pattern) => pattern.test(path)));
  const releaseGate = evaluateVendorAiReleaseGate(status.statuses ?? []);
  const backendTouched = changedFiles.some(isBackendPath);
  return { number: pr.number, url: pr.html_url, state: pr.state, draft: pr.draft, mergeable: pr.mergeable, mergeableState: pr.mergeable_state, head: pr.head?.ref, headSha: pr.head?.sha, changedFiles, criticalFiles, backendTouched, status: releaseGate.state, checks: releaseGate.relevant, releaseGate, githubCombinedStatus: status.state };
}

async function mergePullRequest(number: number) {
  const { owner, repo } = githubConfig();
  const pr = await getPullRequest(number);
  if (!pr.head?.startsWith("dev-ia/")) throw new Error("Merge automático permitido apenas para branches dev-ia/");
  if (pr.criticalFiles.length) {
    const error = new Error(`approval_required: PR contém arquivos críticos: ${pr.criticalFiles.join(", ")}`);
    (error as any).code = "APPROVAL_REQUIRED";
    throw error;
  }
  if (pr.draft || pr.state !== "open") throw new Error("PR não está pronto para merge");
  if (pr.mergeable === false) throw new Error("PR não é mergeável");
  if (pr.releaseGate.state !== "success") {
    const pending = pr.releaseGate.blocking.map((item: any) => `${item.context}:${item.state}`).join(", ");
    throw new Error(`Gates Vercel do VendorAI ainda não estão verdes${pending ? `: ${pending}` : ". Nenhum gate relevante foi confirmado ainda."}`);
  }
  const review = await reviewPullRequestForMerge(number);
  if (review.verdict !== "approve") {
    const topFindings = review.findings.slice(0, 5).map((item) => `${item.severity}: ${item.title}`).join("; ");
    const error = new Error(`approval_required: revisão adversarial bloqueou o merge (${review.verdict}, risco ${review.risk}). ${topFindings || review.reasoningSummary}`);
    (error as any).code = "APPROVAL_REQUIRED";
    (error as any).review = review;
    throw error;
  }

  const latest = await gh(`/repos/${owner}/${repo}/pulls/${number}`);
  const latestHeadSha = String(latest.head?.sha ?? "");
  if (!pr.headSha || !latestHeadSha || latestHeadSha !== pr.headSha) {
    throw new Error("merge_race_detected: o SHA do PR mudou após os gates/revisão; reexecute a revisão sobre o novo head antes do merge.");
  }
  if (latest.state !== "open" || latest.draft || latest.mergeable === false) {
    throw new Error("merge_race_detected: o estado de mergeabilidade do PR mudou após a revisão; reavalie antes de incorporar.");
  }
  const finalComparison = await gh(`/repos/${owner}/${repo}/compare/main...${encodeURIComponent(pr.head).replace(/%2F/g, "/")}`);
  const finalBehindBy = Number(finalComparison?.behind_by ?? 0);
  if (finalBehindBy > 0) {
    throw new Error(`merge_race_detected: a main avançou e a branch ficou ${finalBehindBy} commit(s) atrás após a revisão; atualize a branch e repita os gates.`);
  }

  const data = await gh(`/repos/${owner}/${repo}/pulls/${number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", sha: pr.headSha }) });
  const merged = Boolean(data.merged);
  return {
    merged,
    sha: data.sha,
    message: data.message,
    review,
    releaseGate: pr.releaseGate,
    mergeGuard: { reviewedHeadSha: pr.headSha, latestHeadSha, behindByAtMerge: finalBehindBy },
    postMergeValidation: merged ? { required: true, state: "awaiting_production", runtime: pr.backendTouched ? "railway" : "vercel", expectedRevision: data.sha, backendGate: pr.backendTouched ? "ci:railway" : null } : null,
  };
}

async function createExecutorCompletion(openai: any, messages: any[], requireTool: boolean) {
  const toolChoice = requireTool ? "required" : "auto";
  try {
    const completion = await openai.chat.completions.create({ model: EXECUTOR_PRIMARY_MODEL, max_completion_tokens: 8000, reasoning_effort: "medium", messages, tools, tool_choice: toolChoice } as any);
    return { completion, engine: EXECUTOR_PRIMARY_MODEL, fallbackReason: null as string | null };
  } catch (primaryError) {
    const fallbackReason = primaryError instanceof Error ? primaryError.message.slice(0, 500) : "primary_executor_failed";
    const completion = await openai.chat.completions.create({ model: EXECUTOR_FALLBACK_MODEL, temperature: 0.1, max_tokens: 5000, messages, tools, tool_choice: toolChoice } as any);
    return { completion, engine: EXECUTOR_FALLBACK_MODEL, fallbackReason };
  }
}

const tools: any[] = [
  { type: "function", function: { name: "search_code", description: "Pesquisa arquivos/código no repositório VendorAI.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "get_file", description: "Lê um arquivo de texto do repositório em main ou numa branch dev-ia/.", parameters: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "list_directory", description: "Lista arquivos e subdiretórios de um caminho do repositório para entender a arquitetura antes de editar.", parameters: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" } }, additionalProperties: false } } },
  { type: "function", function: { name: "create_branch", description: "Cria branch de trabalho a partir de main. O nome deve começar com dev-ia/.", parameters: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"], additionalProperties: false } } },
  { type: "function", function: { name: "patch_file", description: "ESCREVE uma alteração cirúrgica em arquivo existente de uma branch dev-ia/. oldText deve existir exatamente uma vez; zero ou múltiplas ocorrências bloqueiam a edição.", parameters: { type: "object", properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" }, branch: { type: "string" }, message: { type: "string" } }, required: ["path", "oldText", "newText", "branch", "message"], additionalProperties: false } } },
  { type: "function", function: { name: "update_file", description: "ESCREVE/substitui um arquivo existente numa branch dev-ia/. Use quando a transformação exigir o conteúdo completo. Não pode editar main nem caminhos críticos.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, branch: { type: "string" }, message: { type: "string" } }, required: ["path", "content", "branch", "message"], additionalProperties: false } } },
  { type: "function", function: { name: "create_file", description: "ESCREVE/cria novo arquivo textual numa branch dev-ia/ somente em caminho não crítico. Use apenas quando não existir fluxo equivalente.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, branch: { type: "string" }, message: { type: "string" } }, required: ["path", "content", "branch", "message"], additionalProperties: false } } },
  { type: "function", function: { name: "compare_branch", description: "Compara uma branch dev-ia/ com main e retorna arquivos, estatísticas e patches resumidos. Deve ser usado antes de abrir PR.", parameters: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"], additionalProperties: false } } },
  { type: "function", function: { name: "preflight_branch", description: "Valida deterministicamente a branch dev-ia/ antes do PR: branch atualizada, tamanho seguro, conflitos, JSON válido e sintaxe TS/TSX/JS/JSX. Corrija todos os achados antes de create_pr.", parameters: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"], additionalProperties: false } } },
  { type: "function", function: { name: "create_pr", description: "Abre PR de uma branch dev-ia/ para main somente quando a branch contém mudanças e passa pelo preflight determinístico obrigatório.", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, head: { type: "string" } }, required: ["title", "body", "head"], additionalProperties: false } } },
  { type: "function", function: { name: "get_pr", description: "Consulta PR, arquivos alterados e gates relevantes do VendorAI.", parameters: { type: "object", properties: { number: { type: "integer" } }, required: ["number"], additionalProperties: false } } },
  { type: "function", function: { name: "merge_pr", description: "Faz squash merge apenas se PR dev-ia/ for não crítico, mergeável, gates Vercel relevantes verdes, aprovado por revisor adversarial e ainda estiver no mesmo SHA/atualizado contra main imediatamente antes do merge. Depois exige validação real de produção; backend passa pelo ci:railway.", parameters: { type: "object", properties: { number: { type: "integer" } }, required: ["number"], additionalProperties: false } } },
];

async function runTool(
  name: string,
  args: any,
  policy: { targetBase: "main" | "staging"; allowMerge: boolean },
) {
  switch (name) {
    case "search_code": return searchCode(String(args.query ?? ""));
    case "get_file": return getFile(String(args.path ?? ""), String(args.ref ?? "main"));
    case "list_directory": return listDirectory(String(args.path ?? ""), String(args.ref ?? "main"));
    case "create_branch": return createBranch(String(args.branch ?? ""));
    case "patch_file": return patchFile({ path: String(args.path ?? ""), oldText: String(args.oldText ?? ""), newText: String(args.newText ?? ""), branch: String(args.branch ?? ""), message: String(args.message ?? "Dev IA patch") });
    case "update_file": return updateFile({ path: String(args.path ?? ""), content: String(args.content ?? ""), branch: String(args.branch ?? ""), message: String(args.message ?? "Dev IA update") });
    case "create_file": return createFile({ path: String(args.path ?? ""), content: String(args.content ?? ""), branch: String(args.branch ?? ""), message: String(args.message ?? "Dev IA create file") });
    case "compare_branch": return compareBranch(String(args.branch ?? ""));
    case "preflight_branch": return preflightBranch(String(args.branch ?? ""));
    case "create_pr": return createPullRequest({ title: String(args.title ?? "Dev IA change"), body: String(args.body ?? ""), head: String(args.head ?? ""), base: policy.targetBase });
    case "get_pr": return getPullRequest(Number(args.number));
    case "merge_pr":
      if (!policy.allowMerge) {
        const error = new Error("approval_required: merge em produção é controlado pela Central de Melhorias & Publicações");
        (error as any).code = "APPROVAL_REQUIRED";
        throw error;
      }
      return mergePullRequest(Number(args.number));
    default: throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

export type DevAutonomousExecutionInput = {
  requestId: string;
  request: string;
  diagnosis?: string;
  route: string;
  source?: "super_admin" | "support_handoff" | "release_center";
};

export async function executeDevAutonomousWork(input: DevAutonomousExecutionInput) {
  const parsed = executeSchema.parse({ ...input, diagnosis: input.diagnosis ?? "" });
  githubConfig();

  const { council, engine: councilEngine } = await createSpecialistCouncil({
    requestId: parsed.requestId,
    request: parsed.request,
    route: parsed.route,
    evidenceContext: parsed.diagnosis,
  });
  const plannerInput = {
    requestId: parsed.requestId,
    request: parsed.request,
    route: parsed.route,
    cognition: { source: input.source ?? "super_admin" },
    investigation: { evidenceContext: parsed.diagnosis, specialistCouncil: council },
  };
  const { plan, engine: plannerEngine } = await createExecutionPlan(plannerInput);
  const baseActions: Array<{ tool: string; ok: boolean; detail?: any }> = [
    { tool: "specialist_council", ok: true, detail: { council, engine: councilEngine } },
    { tool: "planner", ok: true, detail: { plan, engine: plannerEngine } },
  ];

  if (plan.needsApproval) {
    return { success: false, status: "approval_required", error: `Planner classificou a mudança como dependente de aprovação: ${plan.risks.join("; ") || plan.approach}`, council, plan, actions: baseActions };
  }
  if (!plan.shouldExecute) {
    return { success: true, status: "completed", summary: `Planner recomendou não alterar código neste momento. ${plan.approach}`, council, plan, actions: baseActions };
  }

  const openai = await getOpenAIForTenant("");
  const messages: any[] = [
    { role: "system", content: AUTONOMY_SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ requestId: parsed.requestId, route: parsed.route, pedido: parsed.request, diagnostico_previo: parsed.diagnosis, origem: input.source ?? "super_admin", conselho_de_especialistas: council, plano_de_engenharia: plan }) },
  ];
  const actions = [...baseActions];
  const source = input.source ?? "super_admin";
  const releaseControlled = source === "support_handoff" || source === "release_center";
  const executionPolicy = {
    targetBase: (releaseControlled ? "staging" : "main") as "main" | "staging",
    allowMerge: !releaseControlled,
  };
  const executorEngines = new Set<string>();
  const executorFallbacks: string[] = [];

  for (let step = 0; step < 18; step += 1) {
    const execution = await createExecutorCompletion(openai, messages, step === 0);
    executorEngines.add(execution.engine);
    if (execution.fallbackReason) executorFallbacks.push(execution.fallbackReason);
    const message: any = execution.completion.choices[0]?.message;
    if (!message) throw new Error("Executor não retornou mensagem");
    messages.push(message);
    const toolCalls = message.tool_calls ?? [];
    if (!toolCalls.length) {
      const executor = { engines: [...executorEngines], fallbackReasons: executorFallbacks.slice(0, 3) };
      const successfulWrites = actions.filter((action) => action.ok && (action.tool === "patch_file" || action.tool === "update_file" || action.tool === "create_file"));
      const successfulPr = actions.find((action) => action.ok && action.tool === "create_pr");
      if (!successfulWrites.length || !successfulPr) {
        return {
          success: false,
          status: "execution_incomplete",
          error: !successfulWrites.length
            ? "Planner autorizou mudança de código, mas o executor tentou encerrar sem escrever nenhum arquivo."
            : "O executor escreveu código, mas tentou encerrar sem abrir o PR obrigatório.",
          summary: message.content ?? "Execução interrompida por ausência de evidência obrigatória.",
          council,
          plan,
          executor,
          writeEvidence: successfulWrites.map((action) => action.detail),
          actions,
        };
      }
      return {
        success: true,
        status: "completed",
        summary: message.content ?? "Execução concluída sem mensagem final.",
        council,
        plan,
        executor,
        writeEvidence: successfulWrites.map((action) => action.detail),
        pullRequest: successfulPr.detail,
        actions,
      };
    }
    for (const call of toolCalls) {
      const name = call.function?.name;
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { args = {}; }
      try {
        const result = await runTool(name, args, executionPolicy);
        let compactDetail: unknown = result;
        if (name === "get_file") {
          if (!("path" in result && "ref" in result && "sha" in result)) throw new Error("DEV_TOOL_RESULT_MISMATCH");
          compactDetail = { path: result.path, ref: result.ref, sha: result.sha };
        } else if (name === "compare_branch") {
          if (!("branch" in result && "status" in result && "aheadBy" in result && "behindBy" in result && "totalCommits" in result && "files" in result)) throw new Error("DEV_TOOL_RESULT_MISMATCH");
          compactDetail = { branch: result.branch, status: result.status, aheadBy: result.aheadBy, behindBy: result.behindBy, totalCommits: result.totalCommits,
            files: result.files.map((file: Awaited<ReturnType<typeof compareBranch>>["files"][number]) => ({ path: file.path, status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes })) };
        }
        actions.push({ tool: name, ok: true, detail: compactDetail });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Erro desconhecido";
        const approvalRequired = messageText.startsWith("approval_required:") || (error as any)?.code === "APPROVAL_REQUIRED";
        const result = { ok: false, error: messageText, approval_required: approvalRequired, ...(approvalRequired && (error as any)?.review ? { review: (error as any).review } : {}) };
        actions.push({ tool: name, ok: false, detail: result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        if (approvalRequired) {
          return { success: false, status: "approval_required", error: messageText.replace(/^approval_required:\s*/i, ""), council, plan, executor: { engines: [...executorEngines], fallbackReasons: executorFallbacks.slice(0, 3) }, actions, ...(result.review ? { review: result.review } : {}) };
        }
      }
    }
  }

  return { success: false, status: "step_limit", error: "Executor atingiu o limite seguro de etapas.", council, plan, executor: { engines: [...executorEngines], fallbackReasons: executorFallbacks.slice(0, 3) }, actions };
}

router.post("/support/dev/execute", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode executar o Dev IA." });
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido" });
  try {
    const result = await executeDevAutonomousWork({ ...parsed.data, source: "super_admin" });
    const statusCode = result.status === "approval_required" || result.status === "step_limit" || result.status === "execution_incomplete" ? 409 : 200;
    return res.status(statusCode).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    req.log?.error({ err: error }, "dev-ia: autonomous executor failed");
    return res.status(500).json({ error: message, status: "failed" });
  }
});

export default router;
