import { and, asc, eq, isNotNull } from "drizzle-orm";
import { bugReportsTable, db } from "@workspace/db";
import { createExecutionPlan } from "../routes/dev_agent_planner_reviewer.js";
import { createSpecialistCouncil } from "../routes/dev_agent_specialists.js";

const SUPPORT_HANDOFF_INTERVAL_MS = 30_000;
const SUPPORT_HANDOFF_BATCH_SIZE = 3;

let handoffTimer: NodeJS.Timeout | null = null;
let handoffRunning = false;

type HandoffLogger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, repository, owner, repo };
}

async function createTechnicalTask(args: {
  requestId: string;
  title: string;
  request: string;
  route: string;
  diagnosis: string;
  plan: any;
  council: any;
}) {
  const { token, repository } = githubConfig();
  const body = [
    "## Origem",
    "Chamado técnico criado automaticamente pelo Agente de Suporte do VendorAI.",
    "",
    `- Dev IA requestId: \`${args.requestId}\``,
    `- Rota afetada: \`${args.route}\``,
    "- Fluxo: Suporte → Dev IA",
    "",
    "## Chamado",
    args.request,
    "",
    "## Diagnóstico recebido do suporte",
    args.diagnosis || "Sem diagnóstico adicional do suporte.",
    "",
    "## Conselho de Especialistas",
    JSON.stringify(args.council, null, 2).slice(0, 8000),
    "",
    "## Plano de Engenharia",
    JSON.stringify(args.plan, null, 2).slice(0, 8000),
    "",
    "## Guardrails",
    "- preservar o fluxo existente e evitar módulos paralelos;",
    "- nenhuma mudança crítica pode ser executada sem aprovação do Super Admin;",
    "- branch + PR + gates reais antes de qualquer conclusão;",
    "- merge não equivale a produção;",
    "- só encerrar o chamado após validação real do runtime.",
  ].join("\n");

  const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Support-Dev-Handoff/1.0",
    },
    body: JSON.stringify({
      title: `[Suporte → Dev IA] ${args.title}`.slice(0, 120),
      body,
    }),
  });

  const data = await response.json() as { number?: number; html_url?: string; message?: string };
  if (!response.ok || !data.number || !data.html_url) {
    throw new Error(data.message ?? `GitHub HTTP ${response.status}`);
  }
  return { issueNumber: data.number, issueUrl: data.html_url, repository };
}

function ticketRequest(report: typeof bugReportsTable.$inferSelect) {
  return [
    `Título: ${report.titulo}`,
    `Descrição: ${report.descricao}`,
    `Prioridade do suporte: ${report.prioridade}`,
    report.rotaAfetada ? `Rota afetada: ${report.rotaAfetada}` : "Rota afetada: não informada",
  ].join("\n");
}

async function claimTicket(id: string) {
  const [claimed] = await db
    .update(bugReportsTable)
    .set({
      status: "em_analise",
      resolvidoPor: "dev_ia",
      updatedAt: new Date(),
    })
    .where(and(eq(bugReportsTable.id, id), eq(bugReportsTable.status, "aberto")))
    .returning();
  return claimed ?? null;
}

async function processTicket(report: typeof bugReportsTable.$inferSelect, logger: HandoffLogger) {
  const claimed = await claimTicket(report.id);
  if (!claimed) return;

  const request = ticketRequest(claimed);
  const route = claimed.rotaAfetada?.trim() || "/support";
  const evidenceContext = [
    `Origem: chamado do Agente de Suporte`,
    `Tenant: ${claimed.tenantId}`,
    `Protocolo técnico: ${claimed.id}`,
    claimed.respostaSuporte ? `Resposta inicial do suporte: ${claimed.respostaSuporte}` : "",
  ].filter(Boolean).join("\n");

  try {
    const { council, engine: councilEngine } = await createSpecialistCouncil({
      requestId: claimed.id,
      request,
      route,
      evidenceContext,
    });

    const { plan, engine: plannerEngine } = await createExecutionPlan({
      requestId: claimed.id,
      request,
      route,
      cognition: { source: "support_handoff" },
      investigation: { evidenceContext, specialistCouncil: council },
    });

    if (plan.needsApproval) {
      const diagnostic = [
        "Dev IA assumiu automaticamente este chamado.",
        "Situação: aprovação do Super Admin necessária antes de qualquer alteração.",
        `Riscos: ${plan.risks.join("; ") || "mudança classificada como sensível"}`,
        `Plano: ${plan.approach}`,
        `Motores: conselho=${councilEngine}; planner=${plannerEngine}`,
      ].join("\n").slice(0, 12000);

      await db.update(bugReportsTable).set({
        erroTecnico: diagnostic,
        status: "em_analise",
        resolvidoPor: "dev_ia",
        updatedAt: new Date(),
      }).where(eq(bugReportsTable.id, claimed.id));

      logger.warn({ bugReportId: claimed.id, route }, "support handoff: approval required");
      return;
    }

    if (!plan.shouldExecute) {
      const diagnostic = [
        "Dev IA assumiu automaticamente este chamado e concluiu a triagem técnica.",
        "Nenhuma alteração de código foi autorizada pelo Planner neste momento.",
        `Plano: ${plan.approach}`,
        plan.tests.length ? `Validações sugeridas: ${plan.tests.join("; ")}` : "",
        `Motores: conselho=${councilEngine}; planner=${plannerEngine}`,
      ].filter(Boolean).join("\n").slice(0, 12000);

      await db.update(bugReportsTable).set({
        erroTecnico: diagnostic,
        status: "em_analise",
        resolvidoPor: "dev_ia",
        updatedAt: new Date(),
      }).where(eq(bugReportsTable.id, claimed.id));

      logger.info({ bugReportId: claimed.id, route }, "support handoff: triaged without code execution");
      return;
    }

    const task = await createTechnicalTask({
      requestId: claimed.id,
      title: claimed.titulo,
      request,
      route,
      diagnosis: evidenceContext,
      plan,
      council,
    });

    const diagnostic = [
      "Dev IA assumiu automaticamente este chamado.",
      "A triagem técnica autorizou trabalho de engenharia de baixo risco, sujeito às guardrails do executor.",
      `Tarefa técnica: #${task.issueNumber} ${task.issueUrl}`,
      `Plano: ${plan.approach}`,
      `Motores: conselho=${councilEngine}; planner=${plannerEngine}`,
      "O chamado permanece em análise até existir evidência real de correção e produção.",
    ].join("\n").slice(0, 12000);

    await db.update(bugReportsTable).set({
      erroTecnico: diagnostic,
      status: "em_analise",
      resolvidoPor: "dev_ia",
      updatedAt: new Date(),
    }).where(eq(bugReportsTable.id, claimed.id));

    logger.info({ bugReportId: claimed.id, issueNumber: task.issueNumber, route }, "support handoff: technical task created");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await db.update(bugReportsTable).set({
      erroTecnico: `Dev IA tentou assumir automaticamente este chamado, mas a triagem técnica falhou: ${message}`.slice(0, 12000),
      status: "em_analise",
      resolvidoPor: "dev_ia",
      updatedAt: new Date(),
    }).where(eq(bugReportsTable.id, claimed.id)).catch(() => undefined);
    logger.error({ err: error, bugReportId: claimed.id }, "support handoff: failed");
  }
}

async function runSupportHandoffCycle(logger: HandoffLogger) {
  if (handoffRunning) return;
  handoffRunning = true;
  try {
    const tickets = await db
      .select()
      .from(bugReportsTable)
      .where(and(
        eq(bugReportsTable.status, "aberto"),
        eq(bugReportsTable.categoria, "bug"),
        isNotNull(bugReportsTable.conversationId),
      ))
      .orderBy(asc(bugReportsTable.createdAt))
      .limit(SUPPORT_HANDOFF_BATCH_SIZE);

    for (const ticket of tickets) {
      await processTicket(ticket, logger);
    }
  } catch (error) {
    logger.error({ err: error }, "support handoff: cycle failed");
  } finally {
    handoffRunning = false;
  }
}

export function startDevAgentSupportHandoff(logger: HandoffLogger) {
  if (handoffTimer) return;
  logger.info({ intervalMs: SUPPORT_HANDOFF_INTERVAL_MS }, "support handoff: Dev IA worker started");
  void runSupportHandoffCycle(logger);
  handoffTimer = setInterval(() => { void runSupportHandoffCycle(logger); }, SUPPORT_HANDOFF_INTERVAL_MS);
  handoffTimer.unref();
}
