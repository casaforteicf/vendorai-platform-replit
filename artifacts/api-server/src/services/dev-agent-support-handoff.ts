import { and, asc, eq, isNotNull } from "drizzle-orm";
import { bugReportsTable, db } from "@workspace/db";
import { executeDevAutonomousWork } from "../routes/dev_agent_autonomy.js";
import { recordExecutionMemory } from "../routes/dev_agent_memory.js";
import { validateProductionRevision } from "../routes/dev_agent_validation.js";

const SUPPORT_HANDOFF_INTERVAL_MS = 30_000;
const SUPPORT_HANDOFF_BATCH_SIZE = 3;
const SUPPORT_VALIDATION_BATCH_SIZE = 5;
const REVISION_MARKER = "DEV_IA_EXPECTED_REVISION=";
const CUSTOMER_RESOLUTION_MESSAGE = "Identificamos e corrigimos o problema relatado. A correção já foi validada em produção.";

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
  const actions = Array.isArray(result?.actions) ? result.actions : [];
  const action = [...actions].reverse().find((item: any) => item?.tool === tool && item?.ok);
  return action?.detail ?? null;
}

function executionChangedFiles(result: any) {
  const pr = actionDetail(result, "create_pr");
  if (Array.isArray(pr?.changedFiles)) return pr.changedFiles.slice(0, 20).map((path: unknown) => String(path).slice(0, 300));

  const compare = actionDetail(result, "compare_branch");
  if (Array.isArray(compare?.files)) {
    return compare.files.slice(0, 20).map((file: any) => String(file?.path ?? "").slice(0, 300)).filter(Boolean);
  }

  const writes = Array.isArray(result?.writeEvidence) ? result.writeEvidence : [];
  return writes.slice(0, 20).map((item: any) => String(item?.path ?? "").slice(0, 300)).filter(Boolean);
}

function executionFailures(result: any) {
  const failures = Array.isArray(result?.actions)
    ? result.actions
        .filter((action: any) => action?.ok === false)
        .slice(-8)
        .map((action: any) => sanitizeTechnicalText(`${String(action?.tool ?? "tool")}: ${String(action?.detail?.error ?? "falhou")}`).slice(0, 500))
    : [];
  if (result?.success === false && result?.error) failures.push(sanitizeTechnicalText(result.error).slice(0, 500));
  return failures.slice(0, 8);
}

async function persistExecutorOutcome(report: typeof bugReportsTable.$inferSelect, result: any, route: string) {
  const pr = actionDetail(result, "create_pr");
  const merge = actionDetail(result, "merge_pr");
  const changedFiles = executionChangedFiles(result);
  const evidence = [
    "source=support_handoff",
    pr?.number ? `pr=${Number(pr.number)}` : "",
    merge?.sha ? `merge=${String(merge.sha).slice(0, 12)}` : "",
    merge?.postMergeValidation?.runtime ? `validation_runtime=${String(merge.postMergeValidation.runtime)}` : "",
  ].filter(Boolean);

  await recordExecutionMemory({
    requestId: report.id,
    route: route.slice(0, 500),
    recordedAt: new Date().toISOString(),
    status: String(result?.status ?? (result?.success === false ? "failed" : "completed")).slice(0, 60),
    summary: sanitizeTechnicalText(result?.summary ?? result?.error ?? "Execução do chamado concluída sem resumo.").slice(0, 1200),
    ...(pr?.number ? { pullRequestNumber: Number(pr.number) } : {}),
    ...(merge?.sha ? { mergeSha: String(merge.sha).slice(0, 64) } : {}),
    changedFiles,
    engines: Array.isArray(result?.executor?.engines) ? result.executor.engines.slice(0, 5).map((engine: unknown) => String(engine).slice(0, 80)) : [],
    failures: executionFailures(result),
    evidence: evidence.slice(0, 8),
  });
}

function expectedRevisionFromDiagnostic(value: unknown) {
  const match = String(value ?? "").match(/DEV_IA_EXPECTED_REVISION=([0-9a-f]{7,64})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function buildCustomerResolutionResponse(value: unknown) {
  const current = String(value ?? "").trim();
  if (!current) return CUSTOMER_RESOLUTION_MESSAGE;
  if (current.includes(CUSTOMER_RESOLUTION_MESSAGE)) return current.slice(0, 12000);
  return `${current}\n\n${CUSTOMER_RESOLUTION_MESSAGE}`.slice(0, 12000);
}

function buildExecutionDiagnostic(result: any) {
  const pr = actionDetail(result, "create_pr");
  const merge = actionDetail(result, "merge_pr");
  const expectedRevision = merge?.merged && merge?.sha ? String(merge.sha).toLowerCase() : "";
  const lines = [
    "Dev IA assumiu automaticamente este chamado e usou o executor técnico oficial da plataforma.",
    `Estado do executor: ${String(result?.status ?? "unknown")}`,
    result?.summary ? `Resumo: ${sanitizeTechnicalText(result.summary)}` : "",
    pr?.number ? `PR criado: #${pr.number}${pr.url ? ` ${pr.url}` : ""}` : "",
    merge?.merged ? `Merge realizado: ${String(merge.sha ?? "").slice(0, 12)}` : "",
    expectedRevision ? `${REVISION_MARKER}${expectedRevision}` : "",
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

    await persistExecutorOutcome(claimed, result, route).catch((error) => {
      logger.warn({ err: error, bugReportId: claimed.id }, "support handoff: execution memory persistence failed");
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

async function validatePendingSupportDeployments(logger: HandoffLogger) {
  const reports = await db
    .select()
    .from(bugReportsTable)
    .where(and(
      eq(bugReportsTable.status, "em_analise"),
      eq(bugReportsTable.resolvidoPor, "dev_ia"),
      isNotNull(bugReportsTable.erroTecnico),
    ))
    .orderBy(asc(bugReportsTable.updatedAt))
    .limit(SUPPORT_VALIDATION_BATCH_SIZE);

  for (const report of reports) {
    const expectedRevision = expectedRevisionFromDiagnostic(report.erroTecnico);
    if (!expectedRevision) continue;

    try {
      const validation = await validateProductionRevision(expectedRevision);
      if (validation.state !== "validated") {
        logger.info({ bugReportId: report.id, expectedRevision: expectedRevision.slice(0, 12), state: validation.state }, "support handoff: production validation pending");
        continue;
      }

      const changedFiles = Array.isArray(validation.evidence?.changedFiles)
        ? validation.evidence.changedFiles.slice(0, 20).map((path: unknown) => String(path).slice(0, 300))
        : [];

      await recordExecutionMemory({
        requestId: report.id,
        route: (report.rotaAfetada?.trim() || "/support").slice(0, 500),
        recordedAt: new Date().toISOString(),
        status: "production_validated",
        summary: `Produção validada automaticamente pelo Dev IA para a revisão ${expectedRevision.slice(0, 12)} após chamado do Suporte.`,
        mergeSha: expectedRevision,
        changedFiles,
        engines: ["support-post-deploy-validator"],
        failures: [],
        evidence: [
          "source=support_handoff",
          `runtime=${validation.runtime}`,
          `expected=${expectedRevision.slice(0, 12)}`,
          validation.observedRevision ? `observed=${validation.observedRevision.slice(0, 12)}` : "",
          validation.mainRevision ? `main=${validation.mainRevision.slice(0, 12)}` : "",
        ].filter(Boolean).slice(0, 8),
      }).catch((error) => {
        logger.warn({ err: error, bugReportId: report.id }, "support handoff: production memory persistence failed");
      });

      const currentDiagnostic = String(report.erroTecnico ?? "").slice(0, 10500);
      const completedDiagnostic = [
        currentDiagnostic,
        "",
        `Produção validada: ${new Date().toISOString()}`,
        `Runtime: ${validation.runtime}`,
        `Revisão validada: ${expectedRevision.slice(0, 12)}`,
        "Chamado encerrado automaticamente somente após evidência real de produção.",
      ].join("\n").slice(0, 12000);

      await db.update(bugReportsTable).set({
        erroTecnico: completedDiagnostic,
        respostaSuporte: buildCustomerResolutionResponse(report.respostaSuporte),
        status: "resolvido",
        resolvidoPor: "dev_ia",
        resolvidoAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(bugReportsTable.id, report.id), eq(bugReportsTable.status, "em_analise")));

      logger.info({ bugReportId: report.id, expectedRevision: expectedRevision.slice(0, 12), runtime: validation.runtime }, "support handoff: production validated and ticket resolved");
    } catch (error) {
      logger.warn({ err: error, bugReportId: report.id }, "support handoff: production validation cycle failed");
    }
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
    await validatePendingSupportDeployments(logger);
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
