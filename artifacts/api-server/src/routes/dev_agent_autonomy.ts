import { Router } from "express";
import { z } from "zod/v4";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import cognitionRouter from "./dev_agent_cognition";

const router = Router();
router.use(cognitionRouter);

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
];

const AUTONOMY_SYSTEM_PROMPT = `Você é o executor autônomo do Dev IA da plataforma VendorAI.

Sua missão é transformar pedidos técnicos aprovados pelo Super Admin em trabalho real no repositório, usando as ferramentas disponíveis.

REGRAS OBRIGATÓRIAS:
- Trabalhe somente no repositório configurado do VendorAI.
- Nunca altere main/master diretamente.
- Para mudança de código: pesquise, leia os arquivos necessários, crie uma branch dev-ia/<slug>, altere apenas o necessário, crie PR e verifique o status.
- Faça mudanças pequenas, reversíveis e coerentes com a arquitetura existente.
- Não crie módulos paralelos quando já existir fluxo equivalente.
- Nunca delete arquivos ou dados.
- Não tente contornar bloqueios de segurança retornados pelas ferramentas.
- Mudanças em autenticação, billing/pagamentos, migrations/schema/RLS, segredos, workflows CI/CD ou infraestrutura são consideradas críticas e devem parar em approval_required.
- Só faça merge automático quando a ferramenta permitir e os checks estiverem verdes.
- Nunca diga que algo foi publicado/validado se não houver evidência.
- Se a solicitação for apenas pergunta, auditoria ou diagnóstico sem necessidade de código, não faça alteração.

Ao terminar, responda de forma curta com: o que encontrou, o que alterou, branch/PR se criados, estado dos checks e qualquer bloqueio.`;

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
      "User-Agent": "VendorAI-Dev-Agent/2.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) {
    const message = data?.message ?? `GitHub HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function normalizeBranch(input: string) {
  const branch = input.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._/-]/g, "-");
  if (!branch.startsWith("dev-ia/")) throw new Error("A branch do Dev IA deve começar com dev-ia/");
  if (branch === "dev-ia/" || branch.length > 120) throw new Error("Nome de branch inválido");
  return branch;
}

function assertEditablePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("..")) throw new Error("Caminho inválido");
  if (CRITICAL_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
    const error = new Error(`approval_required: alteração crítica bloqueada em ${path}`);
    (error as any).code = "APPROVAL_REQUIRED";
    throw error;
  }
}

async function searchCode(query: string) {
  const { repository } = githubConfig();
  const q = encodeURIComponent(`${query} repo:${repository}`);
  const data = await gh(`/search/code?q=${q}&per_page=8`);
  return {
    total: data.total_count ?? 0,
    items: (data.items ?? []).slice(0, 8).map((item: any) => ({ path: item.path, name: item.name, url: item.html_url })),
  };
}

async function getFile(path: string, ref = "main") {
  const { owner, repo } = githubConfig();
  const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`);
  if (data.type !== "file" || typeof data.content !== "string") throw new Error("Arquivo não encontrado ou não é arquivo de texto");
  const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  if (content.length > 120000) throw new Error("Arquivo grande demais para edição autônoma");
  return { path, ref, sha: data.sha, content };
}

async function createBranch(branchInput: string) {
  const { owner, repo } = githubConfig();
  const branch = normalizeBranch(branchInput);
  const base = await gh(`/repos/${owner}/${repo}/git/ref/heads/main`);
  try {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
    });
    return { branch, created: true, baseSha: base.object.sha };
  } catch (error) {
    if (error instanceof Error && /Reference already exists/i.test(error.message)) {
      return { branch, created: false, alreadyExists: true };
    }
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
    body: JSON.stringify({
      message: args.message.slice(0, 120),
      content: Buffer.from(args.content, "utf8").toString("base64"),
      sha: existing.sha,
      branch,
    }),
  });
  return { path: args.path, branch, commitSha: data.commit?.sha, contentSha: data.content?.sha };
}

async function createPullRequest(args: { title: string; body: string; head: string }) {
  const { owner, repo } = githubConfig();
  const head = normalizeBranch(args.head);
  const data = await gh(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: args.title.slice(0, 120),
      body: args.body.slice(0, 12000),
      head,
      base: "main",
      draft: false,
    }),
  });
  return { number: data.number, url: data.html_url, headSha: data.head?.sha, mergeable: data.mergeable };
}

async function getPullRequest(number: number) {
  const { owner, repo } = githubConfig();
  const pr = await gh(`/repos/${owner}/${repo}/pulls/${number}`);
  const files = await gh(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
  const status = await gh(`/repos/${owner}/${repo}/commits/${pr.head.sha}/status`);
  const criticalFiles = (files ?? []).map((file: any) => file.filename).filter((path: string) => CRITICAL_PATH_PATTERNS.some((pattern) => pattern.test(path)));
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state,
    draft: pr.draft,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    head: pr.head?.ref,
    headSha: pr.head?.sha,
    changedFiles: (files ?? []).map((file: any) => file.filename),
    criticalFiles,
    status: status.state,
    checks: (status.statuses ?? []).map((item: any) => ({ context: item.context, state: item.state })),
  };
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
  if (pr.status !== "success") throw new Error(`Checks ainda não estão verdes: ${pr.status}`);
  const data = await gh(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
  return { merged: Boolean(data.merged), sha: data.sha, message: data.message };
}

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Pesquisa arquivos/código no repositório VendorAI.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file",
      description: "Lê um arquivo de texto do repositório em main ou numa branch dev-ia/.",
      parameters: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" } }, required: ["path"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_branch",
      description: "Cria branch de trabalho a partir de main. O nome deve começar com dev-ia/.",
      parameters: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "update_file",
      description: "Substitui um arquivo existente numa branch dev-ia/. Não pode editar main nem caminhos críticos.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          branch: { type: "string" },
          message: { type: "string" },
        },
        required: ["path", "content", "branch", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_pr",
      description: "Abre PR de uma branch dev-ia/ para main.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" }, head: { type: "string" } },
        required: ["title", "body", "head"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pr",
      description: "Consulta PR, arquivos alterados e status/checks.",
      parameters: { type: "object", properties: { number: { type: "integer" } }, required: ["number"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "merge_pr",
      description: "Faz squash merge apenas se PR dev-ia/ for não crítico, mergeável e estiver com checks verdes.",
      parameters: { type: "object", properties: { number: { type: "integer" } }, required: ["number"], additionalProperties: false },
    },
  },
];

async function runTool(name: string, args: any) {
  switch (name) {
    case "search_code": return searchCode(String(args.query ?? ""));
    case "get_file": return getFile(String(args.path ?? ""), String(args.ref ?? "main"));
    case "create_branch": return createBranch(String(args.branch ?? ""));
    case "update_file": return updateFile({ path: String(args.path ?? ""), content: String(args.content ?? ""), branch: String(args.branch ?? ""), message: String(args.message ?? "Dev IA update") });
    case "create_pr": return createPullRequest({ title: String(args.title ?? "Dev IA change"), body: String(args.body ?? ""), head: String(args.head ?? "") });
    case "get_pr": return getPullRequest(Number(args.number));
    case "merge_pr": return mergePullRequest(Number(args.number));
    default: throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

router.post("/support/dev/execute", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode executar o Dev IA." });
  }

  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido" });

  try {
    githubConfig();
    const openai = await getOpenAIForTenant("");
    const messages: any[] = [
      { role: "system", content: AUTONOMY_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          requestId: parsed.data.requestId,
          route: parsed.data.route,
          pedido: parsed.data.request,
          diagnostico_previo: parsed.data.diagnosis,
        }),
      },
    ];
    const actions: Array<{ tool: string; ok: boolean; detail?: any }> = [];

    for (let step = 0; step < 12; step += 1) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages,
        tools,
        tool_choice: "auto",
      } as any);
      const message: any = completion.choices[0]?.message;
      if (!message) throw new Error("Executor não retornou mensagem");
      messages.push(message);

      const toolCalls = message.tool_calls ?? [];
      if (!toolCalls.length) {
        return res.json({
          success: true,
          status: "completed",
          summary: message.content ?? "Execução concluída sem mensagem final.",
          actions,
        });
      }

      for (const call of toolCalls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { args = {}; }
        try {
          const result = await runTool(name, args);
          actions.push({ tool: name, ok: true, detail: name === "get_file" ? { path: result.path, ref: result.ref, sha: result.sha } : result });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Erro desconhecido";
          const approvalRequired = messageText.startsWith("approval_required:") || (error as any)?.code === "APPROVAL_REQUIRED";
          const result = { ok: false, error: messageText, approval_required: approvalRequired };
          actions.push({ tool: name, ok: false, detail: result });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
          if (approvalRequired) {
            return res.status(409).json({
              success: false,
              status: "approval_required",
              error: messageText.replace(/^approval_required:\s*/i, ""),
              actions,
            });
          }
        }
      }
    }

    return res.status(409).json({ success: false, status: "step_limit", error: "Executor atingiu o limite seguro de etapas.", actions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    req.log?.error({ err: error }, "dev-ia: autonomous executor failed");
    return res.status(500).json({ error: message, status: "failed" });
  }
});

export default router;