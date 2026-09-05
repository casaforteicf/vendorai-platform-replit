import { and, asc, eq, isNotNull } from "drizzle-orm";
import { bugReportsTable, db } from "@workspace/db";
import { executeDevAutonomousWork } from "../routes/dev_agent_autonomy.js";

const SUPPORT_HANDOFF_INTERVAL_MS = 30_000;
const SUPPORT_HANDOFF_BATCH_SIZE = 3;

let handoffTimer: NodeJS.Timeout | null = null;
let handoffRunning = false;

type HandoffLogger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

function sanitizeTechnicalText(value: unknown) {
  return String(value ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[uuid]")
    .replace(/\b(?:sk-|ghp_|github_pat_|eyJ)[A-Za-z0-9._-]{16,}\b/g, "[credencial]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[valor-redigido]")
    .slice(0, 12000);
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
    .set({ status: "em_analise", resolvidoPor: "dev_ia", updatedAt: new Date() })
    .where(and(eq(bugReportsTable.id, id), eq(bugReportsTable.status, "aberto")))
    .returning();
  return claimed ?? null;
}

function actionDetail(result: any, tool: string) {
  const action = Array.isArray(result?.actions)
    ? result.actions.find((item: any) => item?.tool === tool && item?.ok)
    : null;
  return action?.detail ?? null;
}

function buildExecutionDiagnostic(result: any) {
  const pr = actionDetail(result, "create_pr");
  const merge = actionDetail(result, "merge_pr");
  const lines = [
    "Dev IA assumiu automaticamente este chamado e usou o executor técnico oficial da plataforma.",
    `Estado do executor: ${String(result?.status ?? "unknown")}`,
    result?.summary ? `Resumo: ${sanitizeTechnicalText(result.summary)}` : "",
    pr?.number ? `PR criado: #${pr.number}${pr.url ? ` ${pr.url}` : ""}` : "",
    merge?.merged ? `Merge realizado: ${String(merge.sha ?? "").slice(0, 12)}` : "",
    merge?.postMergeValidation?.required
      ? `Produção: aguardando validação ${merge.postMergeValidation.runtime ?? "runtime"} do SHA ${String(merge.postMergeValidation.expectedRevision ?? "").slice(0, 12)}`
      : "",
    result?.status === "approval_required"
      ? `Aprovação necessária: ${sanitizeTechnicalText(result.error ?? "mudança sensível")}`
      : "",
    "O chamado permanece em análise até existir evidência real de correção em produção.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 12000);
}

async function processTicket(report: typeof bugReportsTable.$inferSelect, logger: HandoffLogger) {
  const claimed = await claimTicket(report.id);
  if (!claimed) return;

  const route = claimed.rotaAfetada?.trim() || "/support";
  // O conteúdo que sai do banco do tenant para modelos/GitHub é redigido.
  const request = sanitizeTechnicalText(ticketRequest(claimed));
  const diagnosis = sanitizeTechnicalText([
    "Origem: chamado do Agente de Suporte",
    `Protocolo interno: ${claimed.id}`,
    claimed.respostaSuporte ? `Resposta inicial do suporte: ${claimed.respostaSuporte}` : "",
  ].filter(Boolean).join("\n"));

  try {
    const result = await executeDevAutonomousWork({
      requestId: claimed.id,
      request,
      diagnosis,
      route: sanitizeTechnicalText(route) || "/support",
      source: "support_handoff",
    });

    await db.update(bugReportsTable).set({
      erroTecnico: buildExecutionDiagnostic(result),
      status: "em_analise",
      resolvidoPor: "dev_ia",
      updatedAt: new Date(),
    }).where(eq(bugReportsTable.id, claimed.id));

    if (result.status === "approval_required") {
      logger.warn({ bugReportId: claimed.id, route }, "support handoff: executor requires approval");
    } else {
      logger.info({ bugReportId: claimed.id, route, status: result.status }, "support handoff: executor cycle completed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await db.update(bugReportsTable).set({
      erroTecnico: `Dev IA tentou executar este chamado, mas o ciclo técnico falhou: ${sanitizeTechnicalText(message)}`.slice(0, 12000),
      status: "em_analise",
      resolvidoPor: "dev_ia",
      updatedAt: new Date(),
    }).where(eq(bugReportsTable.id, claimed.id)).catch(() => undefined);
    logger.error({ err: error, bugReportId: claimed.id }, "support handoff: executor failed");
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

    for (const ticket of tickets) await processTicket(ticket, logger);
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
