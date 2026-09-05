import { Router } from "express";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { getServerRuntimeSnapshot } from "../lib/dev-agent-server-runtime.js";
import { getPlatformContext } from "./dev_agent_platform_context";
import { getPlatformDiagnostics } from "./dev_agent_diagnostics";
import type { ExecutionMemoryEntry } from "./dev_agent_memory";

const router = Router();

const investigateSchema = z.object({
  requestId: z.string().min(1).max(120),
  request: z.string().min(1).max(12000),
  route: z.string().min(1).max(500),
  cognition: z.object({
    intent: z.string().max(40),
    objective: z.string().max(1000),
    risk: z.string().max(20),
    cognitiveEffort: z.number().min(1).max(10),
    investigationPlan: z.array(z.string().max(500)).max(6).optional().default([]),
  }).optional(),
});

type CodeEvidence = { path: string; url?: string; excerpt: string };

type PlaybookMatch = {
  applicable: boolean;
  requestId: string | null;
  status: string | null;
  confidence: number;
  why: string;
  reusableEvidence: string[];
  mustRevalidate: string[];
};

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, repository, owner, repo };
}

async function gh(path: string) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Investigator/2.4",
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

function routeTerms(route: string) {
  return route
    .split("?")[0]
    .split("/")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && !["admin", "api", "app", "apps"].includes(item) && item.length > 2)
    .slice(0, 3);
}

function requestTerms(request: string) {
  const stop = new Set(["esta", "esse", "isso", "aqui", "tela", "quero", "pode", "fazer", "agora", "para", "com", "uma", "mais", "melhor", "melhore", "corrigir", "corrige", "problema", "sistema"]);
  return request
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_-]+/)
    .filter((word) => word.length >= 4 && !stop.has(word))
    .slice(0, 4);
}

function normalizeOutcome(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function isSystemExecutionMemory(entry: ExecutionMemoryEntry) {
  const status = normalizeOutcome(entry.status);
  const engines = entry.engines.map((engine) => normalizeOutcome(engine));
  return /incident|recovered|recovery/.test(status)
    || engines.some((engine) => /sentinel|server runtime/.test(engine));
}

function isProvenOutcome(entry: ExecutionMemoryEntry) {
  return !isSystemExecutionMemory(entry)
    && normalizeOutcome(entry.status) === "production validated"
    && entry.changedFiles.length > 0
    && entry.failures.length === 0;
}

function noPlaybookMatch(why = "Nenhum playbook anterior comprovado foi validado para este caso."): PlaybookMatch {
  return {
    applicable: false,
    requestId: null,
    status: null,
    confidence: 0,
    why,
    reusableEvidence: [],
    mustRevalidate: [],
  };
}

function normalizePlaybookMatch(value: any, candidates: ExecutionMemoryEntry[]): PlaybookMatch {
  if (!value?.applicable) return noPlaybookMatch(String(value?.why ?? "Nenhum playbook foi considerado suficientemente semelhante.").slice(0, 1200));

  const requestedId = String(value?.requestId ?? "").trim();
  const candidate = candidates.find((entry) => entry.requestId === requestedId);
  if (!candidate || !isProvenOutcome(candidate)) {
    return noPlaybookMatch("O playbook sugerido não corresponde a uma execução com production_validated, arquivos alterados e zero falhas; foi descartado pelo backend.");
  }

  return {
    applicable: true,
    requestId: candidate.requestId,
    status: candidate.status,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
    why: String(value?.why ?? "Há semelhança com uma execução validada em produção.").slice(0, 1600),
    reusableEvidence: candidate.evidence.slice(0, 6).map((item) => String(item).slice(0, 500)),
    mustRevalidate: Array.isArray(value?.mustRevalidate)
      ? value.mustRevalidate.slice(0, 8).map((item: unknown) => String(item).slice(0, 700))
      : ["Confirmar no código e runtime atuais que a causa, dependências e validações continuam equivalentes."],
  };
}

async function searchPaths(query: string) {
  const { repository } = githubConfig();
  const q = encodeURIComponent(`${query} repo:${repository}`);
  const data = await gh(`/search/code?q=${q}&per_page=8`);
  return (data.items ?? [])
    .map((item: any) => ({ path: String(item.path ?? ""), url: item.html_url ? String(item.html_url) : undefined }))
    .filter((item: { path: string }) => /\.(ts|tsx|js|jsx|mjs|sql|json|css)$/i.test(item.path));
}

async function readEvidence(path: string, url?: string): Promise<CodeEvidence | null> {
  const { owner, repo } = githubConfig();
  try {
    const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
    const data = await gh(`/repos/${owner}/${repo}/contents/${encoded}?ref=main`);
    if (data.type !== "file" || typeof data.content !== "string") return null;
    const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    const excerpt = content.length > 14000 ? `${content.slice(0, 14000)}\n/* ... excerpt truncated ... */` : content;
    return { path, url, excerpt };
  } catch {
    return null;
  }
}

const INVESTIGATOR_PROMPT = `Você é o Investigador Técnico do VendorAI.
Você recebe código REAL coletado do repositório, um mapa vivo de contexto da plataforma, diagnóstico read-only de PostgreSQL/integrações e runtime server-side agregado. Analise somente o que as evidências permitem concluir.

Objetivos:
- identificar quais arquivos realmente parecem relacionados ao pedido e à rota;
- encontrar causa provável, dependências e riscos;
- usar alterações recentes, PRs abertos, memória técnica e resultados reais de execuções anteriores para detectar regressões, trabalho duplicado ou decisões que já falharam;
- cruzar sinais reais do frontend com 5xx/lentidão observados no backend, PostgreSQL e integrações quando houver correspondência relevante;
- avaliar explicitamente se existe um playbook anterior comprovado que realmente seja aplicável ao caso atual;
- separar fato observado de hipótese;
- indicar o que ainda precisa ser verificado;
- não inventar logs, testes ou comportamento não presente nas evidências.

REGRAS:
- platformContext.codeCandidates são pistas priorizadas; fatos de implementação vêm dos arquivos efetivamente lidos em files.
- platformDiagnostics.database contém somente reachability, latência e agregados de pg_stat_activity/pg_locks; não contém SQL text nem dados de tenant.
- platformDiagnostics.integrations deriva somente sinais sanitizados do runtime agrupados por família; não lê tokens nem chama provedores externos.
- Uma degradação de banco ou integração é evidência operacional, não prova causalidade. Só relacione ao pedido quando houver vínculo plausível com rota, arquivos ou sintomas.
- serverRuntime contém somente agregados sanitizados por endpoint/status em janelas de 5 minutos; não contém body, headers, usuário ou tenant.
- Um 5xx/lentidão em serverRuntime é evidência operacional, não prova causalidade. Priorize sinais cujo endpoint tenha relação plausível com a rota/pedido atual e declare quando a relação ainda for hipótese.
- Contagens globais podem indicar degradação ampla, mas não devem ser atribuídas automaticamente à tela atual.
- recentChanges pode explicar regressão recente, mas não prova causalidade sozinho.
- relevantMemory é histórico técnico, não verdade absoluta; código atual prevalece.
- relevantExecutionMemory contém resultados anteriores. Playbook só pode ser aplicado quando o requestId escolhido corresponde a uma entrada production_validated, com arquivos alterados e zero falhas. Incidentes, recovered/Sentinela, completed, merged ou pending são apenas histórico operacional, nunca playbook comprovado.
- Mesmo quando houver playbook aplicável, nunca assuma que a implementação atual é idêntica. Liste em mustRevalidate o que precisa ser confirmado no código, testes, integrações, banco ou runtime atual antes de reutilizar a solução.
- Não copie automaticamente uma correção antiga. Reaproveite apenas evidências, padrões e validações que continuam compatíveis.
- openRelatedPrs devem ser considerados para evitar criar correção paralela ou duplicada.

Retorne SOMENTE JSON válido:
{
  "summary": "resumo técnico curto",
  "likelyCause": "causa provável ou ainda indeterminada",
  "confidence": 0.0,
  "relevantFiles": ["path"],
  "evidence": [{"path":"path ou runtime","finding":"o que foi observado"}],
  "unknowns": ["o que ainda não sabemos"],
  "recommendedNextStep": "próxima ação concreta",
  "playbookMatch": {
    "applicable": false,
    "requestId": null,
    "confidence": 0.0,
    "why": "por que é ou não aplicável",
    "mustRevalidate": ["verificação obrigatória antes de reutilizar"]
  }
}`;

function parseJson(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Resposta do investigador inválida");
  }
}

router.post("/support/dev/investigate", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode usar o Investigador do Dev IA." });
  }

  const parsed = investigateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });

  try {
    githubConfig();
    const [platformResult, diagnosticsResult] = await Promise.allSettled([
      getPlatformContext({ route: parsed.data.route, request: parsed.data.request }),
      getPlatformDiagnostics(),
    ]);
    const platformContext = platformResult.status === "fulfilled" ? platformResult.value : null;
    const platformDiagnostics = diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value : null;
    const serverRuntime = platformDiagnostics?.runtime ?? getServerRuntimeSnapshot(8);
    const terms = [...new Set([
      ...(platformContext?.routeTerms ?? routeTerms(parsed.data.route)),
      ...(platformContext?.requestTerms ?? requestTerms(parsed.data.request)),
    ])];
    const queries = terms.slice(0, 6);
    const unique = new Map<string, { path: string; url?: string }>();

    for (const candidate of platformContext?.codeCandidates ?? []) {
      if (!unique.has(candidate.path)) unique.set(candidate.path, { path: candidate.path, url: candidate.url });
      if (unique.size >= 10) break;
    }

    if (unique.size < 10) {
      const results = await Promise.all(queries.map((query) => searchPaths(query).catch(() => [])));
      for (const group of results) {
        for (const item of group) {
          if (!unique.has(item.path)) unique.set(item.path, item);
          if (unique.size >= 10) break;
        }
        if (unique.size >= 10) break;
      }
    }

    const evidence = (await Promise.all([...unique.values()].slice(0, 10).map((item) => readEvidence(item.path, item.url))))
      .filter((item): item is CodeEvidence => Boolean(item));

    if (!evidence.length) {
      const diagnosticEvidence = [
        ...(platformDiagnostics?.database.warnings ?? []).slice(0, 3).map((warning) => ({ path: "database", finding: warning })),
        ...serverRuntime.topSignals.slice(0, 4).map((signal) => ({
          path: "runtime",
          finding: `${signal.kind}: ${signal.method} ${signal.path} status ${signal.status}, ${signal.count} ocorrências, média ${signal.avgDurationMs}ms.`,
        })),
      ];
      return res.json({
        success: true,
        investigation: {
          summary: "Não encontrei evidência de código suficiente para a rota/pedido com as buscas atuais.",
          likelyCause: "indeterminada",
          confidence: 0.2,
          relevantFiles: [],
          evidence: diagnosticEvidence,
          unknowns: ["É necessário ampliar a busca no repositório e correlacionar os sinais operacionais com a implementação atual."],
          recommendedNextStep: "Ampliar investigação antes de editar código.",
          playbookMatch: noPlaybookMatch("Sem evidência atual de código, um histórico anterior não pode ser promovido a playbook aplicável."),
        },
        queries,
        platformContext,
        platformDiagnostics,
        serverRuntime,
      });
    }

    const context = {
      route: parsed.data.route,
      request: parsed.data.request,
      cognition: parsed.data.cognition,
      serverRuntime,
      platformDiagnostics: platformDiagnostics ? {
        database: platformDiagnostics.database,
        integrations: platformDiagnostics.integrations,
        privacy: platformDiagnostics.privacy,
        checkedAt: platformDiagnostics.checkedAt,
      } : null,
      platformContext: platformContext ? {
        confidence: platformContext.confidence,
        recentChanges: platformContext.recentChanges,
        openRelatedPrs: platformContext.openRelatedPrs,
        relevantMemory: platformContext.relevantMemory,
        relevantExecutionMemory: platformContext.relevantExecutionMemory,
        codeCandidates: platformContext.codeCandidates.map((item) => ({ path: item.path, score: item.score, matchedBy: item.matchedBy })),
      } : null,
      files: evidence.map((item) => ({ path: item.path, excerpt: item.excerpt })),
    };

    let raw = "";
    let engine = "claude-sonnet-4-6";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3600,
        temperature: 0,
        system: INVESTIGATOR_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(context) }],
      });
      raw = message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
    } catch (anthropicError) {
      req.log?.warn({ err: anthropicError }, "dev-ia investigator: anthropic falhou, usando fallback");
      engine = "gpt-4o-mini-fallback";
      const openai = await getOpenAIForTenant("");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 3600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INVESTIGATOR_PROMPT },
          { role: "user", content: JSON.stringify(context) },
        ],
      });
      raw = completion.choices[0]?.message?.content ?? "{}";
    }

    const analysis = parseJson(raw);
    const playbookMatch = normalizePlaybookMatch(analysis?.playbookMatch, platformContext?.relevantExecutionMemory ?? []);
    const investigation = {
      summary: String(analysis?.summary ?? "Investigação concluída.").slice(0, 4000),
      likelyCause: String(analysis?.likelyCause ?? "indeterminada").slice(0, 3000),
      confidence: Math.max(0, Math.min(1, Number(analysis?.confidence ?? 0.5))),
      relevantFiles: Array.isArray(analysis?.relevantFiles) ? analysis.relevantFiles.slice(0, 10).map(String) : evidence.map((item) => item.path),
      evidence: Array.isArray(analysis?.evidence) ? analysis.evidence.slice(0, 16) : [],
      unknowns: Array.isArray(analysis?.unknowns) ? analysis.unknowns.slice(0, 10).map(String) : [],
      recommendedNextStep: String(analysis?.recommendedNextStep ?? "Revisar os achados antes de executar.").slice(0, 3000),
      playbookMatch,
    };

    return res.json({ success: true, investigation, queries, engine, platformContext, platformDiagnostics, serverRuntime });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia investigator failed");
    return res.status(500).json({ error: "Falha na investigação técnica do Dev IA" });
  }
});

export default router;