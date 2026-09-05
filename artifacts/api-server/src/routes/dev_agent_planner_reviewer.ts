import { Router } from "express";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

const router = Router();

const planSchema = z.object({
  requestId: z.string().min(1).max(120),
  request: z.string().min(1).max(12000),
  route: z.string().min(1).max(500),
  cognition: z.record(z.string(), z.any()).optional().default({}),
  investigation: z.record(z.string(), z.any()).optional().default({}),
});

export type PlannerInput = z.infer<typeof planSchema>;

export type DevExecutionPlan = {
  objective: string;
  approach: string;
  filesToInspect: string[];
  filesLikelyToChange: string[];
  steps: string[];
  tests: string[];
  rollback: string[];
  risks: string[];
  acceptanceCriteria: string[];
  shouldExecute: boolean;
  needsApproval: boolean;
  confidence: number;
  playbookUsage?: {
    used: true;
    requestId: string;
    status: string | null;
    confidence: number;
    why: string;
    reusedEvidence: string[];
    revalidationSteps: string[];
  };
};

export type PreMortemSimulation = {
  verdict: "proceed" | "revise" | "needs_human_review";
  risk: "low" | "medium" | "high" | "critical";
  confidence: number;
  scenarios: Array<{ name: string; probability: "low" | "medium" | "high"; impact: "low" | "medium" | "high" | "critical"; detail: string }>;
  failureModes: string[];
  requiredGuards: string[];
  rollbackTriggers: string[];
  validationFocus: string[];
  reasoningSummary: string;
};

export type AdversarialReview = {
  verdict: "approve" | "request_changes" | "needs_human_review";
  confidence: number;
  risk: "low" | "medium" | "high" | "critical";
  findings: Array<{ severity: "info" | "low" | "medium" | "high" | "critical"; title: string; detail: string; file?: string }>;
  regressionsToTest: string[];
  reasoningSummary: string;
};

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo };
}

async function gh(path: string) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Review/1.0",
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 2000) }; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

function parseJson(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Resposta JSON inválida");
  }
}

const PLANNER_PROMPT = `Você é o Planner de Engenharia do VendorAI.
Transforme a intenção do Cérebro Executivo e a investigação baseada em código real em um plano mínimo, reversível e testável.

Nunca invente arquivos, testes executados ou fatos não presentes no contexto. Se a evidência for insuficiente, shouldExecute=false.
Preserve arquitetura existente e não crie módulos paralelos.
Mudanças em auth, billing, pagamentos, schema/migrations, RLS, secrets, CI/CD ou infraestrutura devem marcar needsApproval=true.
Se investigation.playbookMatch.applicable=true, trate esse histórico apenas como experiência reutilizável: incorpore no plano somente padrões compatíveis com a investigação atual e mantenha explícitas as revalidações exigidas. Um playbook nunca reduz risco, nunca concede autorização e nunca substitui validação do código/runtime atual.

Retorne SOMENTE JSON:
{
  "objective":"...",
  "approach":"...",
  "filesToInspect":[],
  "filesLikelyToChange":[],
  "steps":[],
  "tests":[],
  "rollback":[],
  "risks":[],
  "acceptanceCriteria":[],
  "shouldExecute":true,
  "needsApproval":false,
  "confidence":0.0
}`;

const PREMORTEM_PROMPT = `Você é o Simulador Pré-Mortem do Dev IA.
Assuma que o plano de engenharia falhou em produção e tente explicar como isso poderia ter acontecido ANTES que qualquer arquivo seja alterado.

Você recebe contexto real de investigação, memória, impacto, especialistas e o plano proposto.
Não alegue que testes foram executados. Não invente logs, métricas ou efeitos observados.
Procure principalmente:
- regressões indiretas por imports/referências;
- mistura de tenants e quebra de isolamento;
- estados assíncronos e concorrência;
- incompatibilidade frontend/backend;
- mobile/responsividade;
- integrações externas e webhooks;
- auth/permissões;
- dados, schema e operações destrutivas;
- rollback inviável;
- ausência de critérios de aceitação ou validação proporcional ao risco.

Política:
- risco high/critical sem mitigação clara => needs_human_review;
- plano incompleto mas não crítico => revise;
- proceed somente quando os riscos estiverem cobertos por guardas, validação e rollback coerentes.

Retorne SOMENTE JSON:
{
  "verdict":"proceed|revise|needs_human_review",
  "risk":"low|medium|high|critical",
  "confidence":0.0,
  "scenarios":[{"name":"...","probability":"low|medium|high","impact":"low|medium|high|critical","detail":"..."}],
  "failureModes":[],
  "requiredGuards":[],
  "rollbackTriggers":[],
  "validationFocus":[],
  "reasoningSummary":"..."
}`;

const REVIEWER_PROMPT = `Você é o Revisor Adversarial Independente do VendorAI.
Sua missão NÃO é aprovar o código. Sua missão é tentar provar que o PR está errado antes que ele chegue à main.

Analise o diff real e procure especialmente:
- regressão funcional;
- vazamento ou mistura entre tenants;
- auth/permissões/RLS/segurança;
- mudança de regra de negócio não solicitada;
- módulo paralelo/duplicação;
- erro mobile/responsividade quando frontend;
- inconsistência frontend/backend;
- tratamento incompleto de erro/estado assíncrono;
- risco de apagar/alterar dados;
- ausência de rollback/testes essenciais.

Se houver finding high/critical, verdict deve ser request_changes ou needs_human_review.
Se o diff tocar auth, billing, pagamentos, migrations/schema/RLS, secrets, workflow/infra, verdict deve ser needs_human_review.
Não confie no autor do PR. Use somente o diff e metadados fornecidos.

Retorne SOMENTE JSON:
{
  "verdict":"approve|request_changes|needs_human_review",
  "confidence":0.0,
  "risk":"low|medium|high|critical",
  "findings":[{"severity":"info|low|medium|high|critical","title":"...","detail":"...","file":"..."}],
  "regressionsToTest":[],
  "reasoningSummary":"..."
}`;

function normalizePlan(value: any): DevExecutionPlan {
  return {
    objective: String(value?.objective ?? "Executar a menor correção segura").slice(0, 2000),
    approach: String(value?.approach ?? "Investigar antes de alterar").slice(0, 4000),
    filesToInspect: Array.isArray(value?.filesToInspect) ? value.filesToInspect.slice(0, 12).map(String) : [],
    filesLikelyToChange: Array.isArray(value?.filesLikelyToChange) ? value.filesLikelyToChange.slice(0, 12).map(String) : [],
    steps: Array.isArray(value?.steps) ? value.steps.slice(0, 12).map(String) : [],
    tests: Array.isArray(value?.tests) ? value.tests.slice(0, 12).map(String) : [],
    rollback: Array.isArray(value?.rollback) ? value.rollback.slice(0, 8).map(String) : [],
    risks: Array.isArray(value?.risks) ? value.risks.slice(0, 10).map(String) : [],
    acceptanceCriteria: Array.isArray(value?.acceptanceCriteria) ? value.acceptanceCriteria.slice(0, 10).map(String) : [],
    shouldExecute: Boolean(value?.shouldExecute),
    needsApproval: Boolean(value?.needsApproval),
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
  };
}

function applyLearnedPlaybook(plan: DevExecutionPlan, context: PlannerInput): DevExecutionPlan {
  const match = context.investigation?.playbookMatch;
  const requestId = typeof match?.requestId === "string" ? match.requestId.trim() : "";
  if (!match?.applicable || !requestId) return plan;

  const reusedEvidence = Array.isArray(match?.reusableEvidence)
    ? match.reusableEvidence.slice(0, 6).map((item: unknown) => String(item).slice(0, 500))
    : [];
  const revalidationSteps = Array.isArray(match?.mustRevalidate)
    ? match.mustRevalidate.slice(0, 8).map((item: unknown) => String(item).slice(0, 700))
    : ["Confirmar no código e runtime atuais que a causa e as dependências continuam equivalentes."];
  const status = typeof match?.status === "string" ? match.status.slice(0, 80) : null;
  const why = String(match?.why ?? "Execução anterior validada considerada relevante pelo Investigador.").slice(0, 1600);
  const confidence = Math.max(0, Math.min(1, Number(match?.confidence ?? 0.5)));

  const tests = Array.from(new Set([...plan.tests, ...revalidationSteps])).slice(0, 14);
  const acceptanceCriteria = Array.from(new Set([
    ...plan.acceptanceCriteria,
    ...revalidationSteps.map((step: string) => `Playbook revalidado no estado atual: ${step}`),
  ])).slice(0, 14);

  return {
    ...plan,
    tests,
    acceptanceCriteria,
    approach: `${plan.approach}\nPlaybook aprendido ${requestId} usado somente como referência comprovada; todas as diferenças do estado atual devem ser revalidadas antes da execução.`.slice(0, 4000),
    playbookUsage: {
      used: true,
      requestId: requestId.slice(0, 120),
      status,
      confidence,
      why,
      reusedEvidence,
      revalidationSteps,
    },
  };
}

function normalizeSimulation(value: any): PreMortemSimulation {
  const verdicts = new Set(["proceed", "revise", "needs_human_review"]);
  const risks = new Set(["low", "medium", "high", "critical"]);
  const probabilities = new Set(["low", "medium", "high"]);
  const impacts = new Set(["low", "medium", "high", "critical"]);
  const scenarios = Array.isArray(value?.scenarios) ? value.scenarios.slice(0, 10).map((item: any) => ({
    name: String(item?.name ?? "Cenário de falha").slice(0, 300),
    probability: probabilities.has(item?.probability) ? item.probability : "medium",
    impact: impacts.has(item?.impact) ? item.impact : "medium",
    detail: String(item?.detail ?? "").slice(0, 1800),
  })) : [];
  let verdict = verdicts.has(value?.verdict) ? value.verdict : "revise";
  const risk = risks.has(value?.risk) ? value.risk : "medium";
  if ((risk === "high" || risk === "critical") && verdict === "proceed") verdict = "needs_human_review";
  return {
    verdict,
    risk,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
    scenarios,
    failureModes: Array.isArray(value?.failureModes) ? value.failureModes.slice(0, 12).map((v: unknown) => String(v).slice(0, 1000)) : [],
    requiredGuards: Array.isArray(value?.requiredGuards) ? value.requiredGuards.slice(0, 12).map((v: unknown) => String(v).slice(0, 1000)) : [],
    rollbackTriggers: Array.isArray(value?.rollbackTriggers) ? value.rollbackTriggers.slice(0, 10).map((v: unknown) => String(v).slice(0, 1000)) : [],
    validationFocus: Array.isArray(value?.validationFocus) ? value.validationFocus.slice(0, 12).map((v: unknown) => String(v).slice(0, 1000)) : [],
    reasoningSummary: String(value?.reasoningSummary ?? "Pré-mortem conservador do plano.").slice(0, 3000),
  };
}

function normalizeReview(value: any): AdversarialReview {
  const verdicts = new Set(["approve", "request_changes", "needs_human_review"]);
  const risks = new Set(["low", "medium", "high", "critical"]);
  const findings = Array.isArray(value?.findings) ? value.findings.slice(0, 20).map((item: any) => ({
    severity: ["info", "low", "medium", "high", "critical"].includes(item?.severity) ? item.severity : "medium",
    title: String(item?.title ?? "Achado").slice(0, 300),
    detail: String(item?.detail ?? "").slice(0, 2000),
    ...(item?.file ? { file: String(item.file).slice(0, 500) } : {}),
  })) : [];
  let verdict = verdicts.has(value?.verdict) ? value.verdict : "needs_human_review";
  const risk = risks.has(value?.risk) ? value.risk : "medium";
  if (findings.some((item: any) => item.severity === "high" || item.severity === "critical") && verdict === "approve") verdict = "request_changes";
  return {
    verdict,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
    risk,
    findings,
    regressionsToTest: Array.isArray(value?.regressionsToTest) ? value.regressionsToTest.slice(0, 15).map(String) : [],
    reasoningSummary: String(value?.reasoningSummary ?? "Revisão conservadora do diff.").slice(0, 3000),
  };
}

async function simulatePlan(context: PlannerInput, plan: DevExecutionPlan): Promise<{ simulation: PreMortemSimulation; engine: string }> {
  const payload = { context, plan };
  let raw = "";
  let engine = "claude-sonnet-4-6";
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      temperature: 0,
      system: PREMORTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    raw = message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
  } catch {
    engine = "gpt-4o-mini-fallback";
    const openai = await getOpenAIForTenant("");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: PREMORTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  }
  return { simulation: normalizeSimulation(parseJson(raw)), engine };
}

function applySimulationToPlan(plan: DevExecutionPlan, simulation: PreMortemSimulation): DevExecutionPlan {
  const mergedRisks = Array.from(new Set([...plan.risks, ...simulation.failureModes])).slice(0, 12);
  const mergedTests = Array.from(new Set([...plan.tests, ...simulation.validationFocus])).slice(0, 14);
  const mergedRollback = Array.from(new Set([...plan.rollback, ...simulation.rollbackTriggers])).slice(0, 10);
  const mergedAcceptance = Array.from(new Set([...plan.acceptanceCriteria, ...simulation.requiredGuards])).slice(0, 14);

  if (simulation.verdict === "needs_human_review") {
    return {
      ...plan,
      risks: mergedRisks,
      tests: mergedTests,
      rollback: mergedRollback,
      acceptanceCriteria: mergedAcceptance,
      shouldExecute: false,
      needsApproval: true,
      confidence: Math.min(plan.confidence, simulation.confidence),
      approach: `${plan.approach}\nPré-mortem bloqueou execução automática: ${simulation.reasoningSummary}`.slice(0, 4000),
    };
  }

  if (simulation.verdict === "revise") {
    return {
      ...plan,
      risks: mergedRisks,
      tests: mergedTests,
      rollback: mergedRollback,
      acceptanceCriteria: mergedAcceptance,
      shouldExecute: false,
      confidence: Math.min(plan.confidence, simulation.confidence),
      approach: `${plan.approach}\nPré-mortem exige revisão do plano antes de editar: ${simulation.reasoningSummary}`.slice(0, 4000),
    };
  }

  return {
    ...plan,
    risks: mergedRisks,
    tests: mergedTests,
    rollback: mergedRollback,
    acceptanceCriteria: mergedAcceptance,
    confidence: Math.min(1, (plan.confidence + simulation.confidence) / 2),
  };
}

export async function createExecutionPlan(context: PlannerInput): Promise<{ plan: DevExecutionPlan; engine: string; simulation: PreMortemSimulation; simulationEngine: string }> {
  let raw = "";
  let engine = "claude-sonnet-4-6";
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2600,
      temperature: 0,
      system: PLANNER_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    raw = message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
  } catch {
    engine = "gpt-4o-mini-fallback";
    const openai = await getOpenAIForTenant("");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 2600,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: PLANNER_PROMPT }, { role: "user", content: JSON.stringify(context) }],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  }

  const initialPlan = applyLearnedPlaybook(normalizePlan(parseJson(raw)), context);
  const { simulation, engine: simulationEngine } = await simulatePlan(context, initialPlan);
  const plan = applySimulationToPlan(initialPlan, simulation);
  return { plan, engine, simulation, simulationEngine };
}

router.post("/support/dev/plan", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode usar o Planner do Dev IA." });
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });

  try {
    const result = await createExecutionPlan(parsed.data);
    return res.json({ success: true, ...result });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia planner failed");
    return res.status(500).json({ error: "Falha no Planner do Dev IA" });
  }
});

export async function reviewPullRequestForMerge(number: number): Promise<AdversarialReview> {
  const { owner, repo } = githubConfig();
  const pr = await gh(`/repos/${owner}/${repo}/pulls/${number}`);
  const files = await gh(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
  const criticalPattern = /(^|\/)(migrations?|auth|secrets?)(\/|$)|schema\.(ts|sql)$|billing|payment|subscription|rls|\.github\/workflows|railway|vercel|terraform|docker/i;
  const criticalFiles = (files ?? []).map((file: any) => String(file.filename ?? "")).filter((path: string) => criticalPattern.test(path));
  if (criticalFiles.length) {
    return {
      verdict: "needs_human_review",
      confidence: 1,
      risk: "critical",
      findings: criticalFiles.map((file: string) => ({ severity: "critical", title: "Arquivo crítico alterado", detail: "Merge automático bloqueado por política estrutural.", file })),
      regressionsToTest: [],
      reasoningSummary: "O PR toca arquivos críticos e exige aprovação humana independentemente da análise do modelo.",
    };
  }

  const diff = (files ?? []).map((file: any) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: typeof file.patch === "string" ? file.patch.slice(0, 20000) : "[patch indisponível]",
  }));

  const payload = {
    number: pr.number,
    title: pr.title,
    body: String(pr.body ?? "").slice(0, 8000),
    head: pr.head?.ref,
    base: pr.base?.ref,
    changedFiles: diff,
  };

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3200,
      temperature: 0,
      system: REVIEWER_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    const raw = message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
    return normalizeReview(parseJson(raw));
  } catch {
    return {
      verdict: "needs_human_review",
      confidence: 1,
      risk: "high",
      findings: [{ severity: "high", title: "Revisão independente indisponível", detail: "O merge automático foi bloqueado porque o revisor adversarial não conseguiu concluir a análise." }],
      regressionsToTest: [],
      reasoningSummary: "Falha segura: sem revisão independente, não há merge automático.",
    };
  }
}

export default router;