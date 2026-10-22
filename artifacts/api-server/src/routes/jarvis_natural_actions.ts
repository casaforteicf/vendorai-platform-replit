import { Router, type IRouter } from "express";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { z } from "zod/v4";
import { db, agentConfigsTable, agentTasksTable, jarvisCasesTable, resolveAgentAutonomyLevel } from "@workspace/db";
import { executeTaskAction } from "./agent_tasks.js";
import { resolveJarvisNaturalAction } from "../services/jarvis-natural-action-intent.js";
import { loadJarvisWatchlistIntelligence } from "../services/jarvis-watchlist-intelligence.js";
import { loadJarvisPriorityIntelligence } from "../services/jarvis-priority-intelligence.js";

const router: IRouter = Router();

const outcomeSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
  resultSummary: z.string().trim().min(3).max(5000).nullable().optional(),
  effectiveness: z.enum(["positive", "neutral", "negative", "inconclusive"]).optional(),
  actionTaken: z.string().trim().min(3).max(2000).nullable().optional(),
  financialImpactBrl: z.coerce.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).nullable().optional(),
});

const relevanceFeedbackSchema = z.object({
  relevance: z.enum(["relevant", "irrelevant"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

function writeSse(res: any, content: string, extra: Record<string, unknown> = {}) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true, ...extra })}\n\n`);
  res.end();
}

function lastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const messages = Reflect.get(body, "messages");
  if (!Array.isArray(messages)) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    if (Reflect.get(message, "role") !== "user") continue;
    const content = Reflect.get(message, "content");
    return typeof content === "string" ? content.trim() : null;
  }

  return null;
}

function actionLabel(actionType: string) {
  if (actionType === "aprovacao_desconto") return "aprovação de desconto";
  if (actionType === "aprovacao_fechamento") return "fechamento de negócio";
  if (actionType === "conferencia_estoque") return "conferência de estoque";
  if (actionType === "enviar_whatsapp") return "envio de mensagem WhatsApp";
  return actionType.replaceAll("_", " ");
}

function resolveWindowHours(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(24 * 30, Math.trunc(parsed)));
}

// Abertura proativa compartilhada entre web/mobile. Só leitura; não executa ações.
router.get("/jarvis/proactivity", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) {
    return res.status(403).json({
      error: "Tenant obrigatório",
      diag: {
        hasReqUser: !!req.user,
        reqUserKeys: req.user ? Object.keys(req.user) : null,
        reqUserRaw: req.user ?? null,
        authHeaderPrefix: (req.headers["authorization"] || "").toString().slice(0, 20),
        authHeaderLength: (req.headers["authorization"] || "").toString().length,
      },
    });
  }

  const intelligence = await loadJarvisPriorityIntelligence(tenantId, 8);
  return res.json({
    generatedAt: intelligence.generatedAt,
    summary: intelligence.summary,
    proactivity: intelligence.proactivity,
  });
});

// Leitura determinística para o modo "O que mudou?".
router.get("/jarvis/changes", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const hours = resolveWindowHours(req.query.hours);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      signalKey: jarvisCasesTable.signalKey,
      source: jarvisCasesTable.source,
      category: jarvisCasesTable.category,
      severity: jarvisCasesTable.severity,
      title: jarvisCasesTable.title,
      detail: jarvisCasesTable.detail,
      metric: jarvisCasesTable.metric,
      confidence: jarvisCasesTable.confidence,
      impact: jarvisCasesTable.impact,
      status: jarvisCasesTable.status,
      recommendedAction: jarvisCasesTable.recommendedAction,
      resultSummary: jarvisCasesTable.resultSummary,
      firstDetectedAt: jarvisCasesTable.firstDetectedAt,
      lastDetectedAt: jarvisCasesTable.lastDetectedAt,
      resolvedAt: jarvisCasesTable.resolvedAt,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(and(
      eq(jarvisCasesTable.tenantId, tenantId),
      gte(jarvisCasesTable.updatedAt, since),
    ))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(100);

  const newCases = rows.filter((item) => item.firstDetectedAt >= since);
  const resolved = rows.filter((item) => item.status === "resolved" && item.resolvedAt && item.resolvedAt >= since);
  const dismissed = rows.filter((item) => item.status === "dismissed");
  const activeUpdates = rows.filter((item) => item.status === "open" && item.firstDetectedAt < since);

  return res.json({
    generatedAt: new Date(),
    windowHours: hours,
    since,
    summary: {
      changed: rows.length,
      new: newCases.length,
      activeUpdates: activeUpdates.length,
      resolved: resolved.length,
      dismissed: dismissed.length,
      risks: rows.filter((item) => item.severity === "risk").length,
      opportunities: rows.filter((item) => item.severity === "opportunity").length,
    },
    items: rows.map((item) => ({
      ...item,
      changeType:
        item.status === "resolved" && item.resolvedAt && item.resolvedAt >= since
          ? "resolved"
          : item.status === "dismissed"
            ? "dismissed"
            : item.firstDetectedAt >= since
              ? "new"
              : "updated",
    })),
  });
});

// Fecha o ciclo sinal → decisão → resultado sem criar uma memória paralela.
router.patch("/jarvis/cases/:id/outcome", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const caseId = String(req.params.id ?? "").trim();
  if (!caseId) return res.status(400).json({ error: "Caso Vendor obrigatório" });

  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const now = new Date();
  const status = parsed.data.status;
  const resultSummary = parsed.data.resultSummary ?? null;

  if ((status === "resolved" || status === "dismissed") && !resultSummary) {
    return res.status(422).json({
      error: "Informe o resultado ou motivo antes de encerrar o Caso Vendor.",
    });
  }

  if (parsed.data.effectiveness && !parsed.data.actionTaken) {
    return res.status(422).json({
      error: "Informe a ação realmente tomada para registrar a eficácia da decisão.",
    });
  }

  const [current] = await db
    .select({ id: jarvisCasesTable.id, evidence: jarvisCasesTable.evidence })
    .from(jarvisCasesTable)
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
    .limit(1);

  if (!current) return res.status(404).json({ error: "Caso Vendor não encontrado" });

  const evidence = current.evidence && typeof current.evidence === "object"
    ? { ...current.evidence }
    : {} as Record<string, unknown>;

  if (status === "open") {
    delete evidence.jarvisOutcome;
  } else if (parsed.data.effectiveness) {
    evidence.jarvisOutcome = {
      effectiveness: parsed.data.effectiveness,
      actionTaken: parsed.data.actionTaken ?? null,
      financialImpactBrl: parsed.data.financialImpactBrl ?? null,
      actorId: req.user?.sub ?? req.user?.sub ?? null,
      recordedAt: now.toISOString(),
    };
  }

  const [updated] = await db
    .update(jarvisCasesTable)
    .set({
      status,
      resultSummary,
      evidence,
      resolvedAt: status === "open" ? null : now,
      updatedAt: now,
    })
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
    .returning();

  return res.json(updated);
});

// Feedback rápido de relevância: persiste no próprio Caso Vendor, sem memória paralela.
router.patch("/jarvis/cases/:id/relevance-feedback", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const caseId = String(req.params.id ?? "").trim();
  if (!caseId) return res.status(400).json({ error: "Caso Vendor obrigatório" });

  const parsed = relevanceFeedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [current] = await db
    .select({
      id: jarvisCasesTable.id,
      evidence: jarvisCasesTable.evidence,
    })
    .from(jarvisCasesTable)
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
    .limit(1);

  if (!current) return res.status(404).json({ error: "Caso Vendor não encontrado" });

  const now = new Date();
  const actorId = req.user?.sub ?? req.user?.sub ?? null;
  const evidence = current.evidence && typeof current.evidence === "object"
    ? current.evidence
    : {};

  const [updated] = await db
    .update(jarvisCasesTable)
    .set({
      evidence: {
        ...evidence,
        jarvisFeedback: {
          relevance: parsed.data.relevance,
          note: parsed.data.note ?? null,
          actorId,
          recordedAt: now.toISOString(),
        },
      },
      updatedAt: now,
    })
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
    .returning();

  return res.json(updated);
});

// Watchlist automática: deriva o que merece acompanhamento das fontes oficiais já configuradas.
router.get("/jarvis/watchlist", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const intelligence = await loadJarvisWatchlistIntelligence(tenantId);
  return res.json({
    generatedAt: intelligence.generatedAt,
    windowDays: intelligence.windowDays,
    summary: intelligence.summary,
    items: intelligence.watchlist,
  });
});

// Pontos cegos: só aponta lacunas verificáveis de configuração/cobertura; não inventa ameaças.
router.get("/jarvis/blind-spots", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const intelligence = await loadJarvisWatchlistIntelligence(tenantId);
  return res.json({
    generatedAt: intelligence.generatedAt,
    windowDays: intelligence.windowDays,
    summary: intelligence.summary,
    blindSpots: intelligence.blindSpots,
  });
});

// Modo Diretoria: resumo verificável para leitura executiva semanal/mensal.
router.get("/jarvis/board-brief", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const hours = resolveWindowHours(req.query.hours ?? 24 * 7);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [cases, tasks] = await Promise.all([
    db.select({
      id: jarvisCasesTable.id,
      category: jarvisCasesTable.category,
      severity: jarvisCasesTable.severity,
      title: jarvisCasesTable.title,
      impact: jarvisCasesTable.impact,
      confidence: jarvisCasesTable.confidence,
      status: jarvisCasesTable.status,
      recommendedAction: jarvisCasesTable.recommendedAction,
      resultSummary: jarvisCasesTable.resultSummary,
      updatedAt: jarvisCasesTable.updatedAt,
      resolvedAt: jarvisCasesTable.resolvedAt,
    }).from(jarvisCasesTable)
      .where(and(eq(jarvisCasesTable.tenantId, tenantId), gte(jarvisCasesTable.updatedAt, since)))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(100),
    db.select({
      id: agentTasksTable.id,
      agentName: agentTasksTable.agentName,
      actionType: agentTasksTable.actionType,
      status: agentTasksTable.status,
      createdAt: agentTasksTable.createdAt,
      executedAt: agentTasksTable.executedAt,
      updatedAt: agentTasksTable.updatedAt,
    }).from(agentTasksTable)
      .where(and(eq(agentTasksTable.tenantId, tenantId), gte(agentTasksTable.updatedAt, since)))
      .orderBy(desc(agentTasksTable.updatedAt))
      .limit(100),
  ]);

  const open = cases.filter((item) => item.status === "open");
  const resolved = cases.filter((item) => item.status === "resolved");
  const pendingApprovals = tasks.filter((item) => item.status === "pendente_aprovacao");
  const failedActions = tasks.filter((item) => item.status === "erro" || item.status === "rejeitado");

  return res.json({
    generatedAt: new Date(),
    mode: "diretoria",
    windowHours: hours,
    since,
    summary: {
      casesObserved: cases.length,
      openCases: open.length,
      resolvedCases: resolved.length,
      risks: cases.filter((item) => item.severity === "risk").length,
      opportunities: cases.filter((item) => item.severity === "opportunity").length,
      pendingApprovals: pendingApprovals.length,
      failedOrRejectedActions: failedActions.length,
    },
    priorities: open.slice(0, 12),
    recentResults: resolved.filter((item) => item.resultSummary).slice(0, 10),
    pendingApprovals,
    failedOrRejectedActions: failedActions,
    guardrail: "Este modo resume apenas fatos persistidos do tenant. Não infere causalidade, resultado financeiro ou autorização ausente.",
  });
});

// Modo Auditor: trilha cronológica de sinais, decisões e ações sem reconstruir fatos ausentes.
router.get("/jarvis/audit-trail", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const hours = resolveWindowHours(req.query.hours ?? 24 * 30);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [cases, tasks] = await Promise.all([
    db.select({
      id: jarvisCasesTable.id,
      source: jarvisCasesTable.source,
      category: jarvisCasesTable.category,
      severity: jarvisCasesTable.severity,
      title: jarvisCasesTable.title,
      status: jarvisCasesTable.status,
      recommendedAction: jarvisCasesTable.recommendedAction,
      resultSummary: jarvisCasesTable.resultSummary,
      firstDetectedAt: jarvisCasesTable.firstDetectedAt,
      resolvedAt: jarvisCasesTable.resolvedAt,
      updatedAt: jarvisCasesTable.updatedAt,
    }).from(jarvisCasesTable)
      .where(and(eq(jarvisCasesTable.tenantId, tenantId), gte(jarvisCasesTable.updatedAt, since)))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(200),
    db.select({
      id: agentTasksTable.id,
      agentName: agentTasksTable.agentName,
      actionType: agentTasksTable.actionType,
      status: agentTasksTable.status,
      errorMessage: agentTasksTable.errorMessage,
      createdAt: agentTasksTable.createdAt,
      executedAt: agentTasksTable.executedAt,
      updatedAt: agentTasksTable.updatedAt,
    }).from(agentTasksTable)
      .where(and(eq(agentTasksTable.tenantId, tenantId), gte(agentTasksTable.updatedAt, since)))
      .orderBy(desc(agentTasksTable.updatedAt))
      .limit(200),
  ]);

  const events = [
    ...cases.map((item) => ({
      type: "jarvis_case" as const,
      id: item.id,
      at: item.updatedAt,
      data: item,
    })),
    ...tasks.map((item) => ({
      type: "agent_task" as const,
      id: item.id,
      at: item.updatedAt,
      data: item,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return res.json({
    generatedAt: new Date(),
    mode: "auditor",
    windowHours: hours,
    since,
    summary: {
      caseEvents: cases.length,
      actionEvents: tasks.length,
      pendingApprovals: tasks.filter((item) => item.status === "pendente_aprovacao").length,
      completedActions: tasks.filter((item) => item.status === "concluido").length,
      failedActions: tasks.filter((item) => item.status === "erro").length,
      rejectedActions: tasks.filter((item) => item.status === "rejeitado").length,
    },
    events,
    guardrail: "A trilha mostra o que está persistido. Ausência de evento não deve ser apresentada como prova de que uma decisão ou autorização não ocorreu fora do sistema.",
  });
});

router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

  try {
    const tasks = await db
      .select({
        id: agentTasksTable.id,
        tenantId: agentTasksTable.tenantId,
        leadId: agentTasksTable.leadId,
        agentName: agentTasksTable.agentName,
        actionType: agentTasksTable.actionType,
        payload: agentTasksTable.payload,
        status: agentTasksTable.status,
        result: agentTasksTable.result,
        errorMessage: agentTasksTable.errorMessage,
        scheduledFor: agentTasksTable.scheduledFor,
        executedAt: agentTasksTable.executedAt,
        createdAt: agentTasksTable.createdAt,
        updatedAt: agentTasksTable.updatedAt,
      })
      .from(agentTasksTable)
      .where(and(
        eq(agentTasksTable.tenantId, tenantId),
        or(
          eq(agentTasksTable.status, "pendente_aprovacao"),
          eq(agentTasksTable.status, "aprovado"),
        ),
      ))
      .orderBy(desc(agentTasksTable.createdAt))
      .limit(8);

    const resolution = resolveJarvisNaturalAction(text, tasks);
    if (!resolution.action) return next();

    if (resolution.action === "reject") {
      writeSse(
        res,
        "Entendi a rejeição. Para preservar os efeitos específicos de estoque, desconto e fechamento, use o botão Rejeitar na fila de aprovações. Eu não rejeitei nenhuma ação automaticamente.",
        { jarvisAction: "reject", actionStatus: "requires_queue_confirmation" },
      );
      return;
    }

    if (resolution.ambiguous) {
      writeSse(
        res,
        "Há mais de uma ação compatível. Não executei nada. Diga, por exemplo, “aprova o desconto”, “aprova o fechamento”, “aprova a primeira” ou escolha a ação na fila.",
        { jarvisAction: resolution.action, actionStatus: "ambiguous" },
      );
      return;
    }

    if (!resolution.targetId) {
      writeSse(
        res,
        resolution.action === "execute"
          ? "Não há nenhuma ação aprovada aguardando execução."
          : "Não há nenhuma ação pendente que eu possa aprovar agora.",
        { jarvisAction: resolution.action, actionStatus: "no_target" },
      );
      return;
    }

    const task = tasks.find((candidate) => candidate.id === resolution.targetId);
    if (!task) {
      writeSse(res, "A ação selecionada não está mais disponível. Atualize a fila e tente novamente.", {
        jarvisAction: resolution.action,
        actionStatus: "stale_target",
      });
      return;
    }

    if (resolution.action === "execute") {
      const now = new Date();
      const [executing] = await db
        .update(agentTasksTable)
        .set({ status: "executando", executedAt: now, updatedAt: now })
        .where(and(
          eq(agentTasksTable.id, task.id),
          eq(agentTasksTable.tenantId, tenantId),
          eq(agentTasksTable.status, "aprovado"),
        ))
        .returning();

      if (!executing) {
        writeSse(res, "Essa ação mudou de estado antes da execução. Não executei novamente.", {
          jarvisAction: "execute",
          actionStatus: "state_changed",
        });
        return;
      }

      const finished = await executeTaskAction(executing, req.log);
      writeSse(
        res,
        `${actionLabel(task.actionType)} executada. Status atual: ${finished.status}.`,
        { jarvisAction: "execute", actionStatus: finished.status, taskId: task.id },
      );
      return;
    }

    const [config] = await db
      .select({
        autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
        agents: agentConfigsTable.agents,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    const now = new Date();
    const legacyAutonomyEnabled = Boolean(config?.autonomyEnabledAt && config.autonomyEnabledAt <= now);
    const autonomyLevel = resolveAgentAutonomyLevel(config?.agents, task.agentName, legacyAutonomyEnabled);
    const requiresHumanApproval =
      task.actionType === "aprovacao_fechamento" ||
      task.actionType === "aprovacao_desconto" ||
      task.actionType === "conferencia_estoque";
    const shouldExecuteNow = autonomyLevel !== "manual" || requiresHumanApproval;

    if (shouldExecuteNow) {
      const [executing] = await db
        .update(agentTasksTable)
        .set({ status: "executando", executedAt: now, updatedAt: now })
        .where(and(
          eq(agentTasksTable.id, task.id),
          eq(agentTasksTable.tenantId, tenantId),
          eq(agentTasksTable.status, "pendente_aprovacao"),
        ))
        .returning();

      if (!executing) {
        writeSse(res, "Essa ação mudou de estado antes da aprovação. Não executei novamente.", {
          jarvisAction: "approve",
          actionStatus: "state_changed",
        });
        return;
      }

      const finished = await executeTaskAction(executing, req.log);
      writeSse(
        res,
        `${actionLabel(task.actionType)} aprovada e processada. Status atual: ${finished.status}.`,
        { jarvisAction: "approve", actionStatus: finished.status, taskId: task.id, autonomyLevel },
      );
      return;
    }

    const [approved] = await db
      .update(agentTasksTable)
      .set({ status: "aprovado", updatedAt: now })
      .where(and(
        eq(agentTasksTable.id, task.id),
        eq(agentTasksTable.tenantId, tenantId),
        eq(agentTasksTable.status, "pendente_aprovacao"),
      ))
      .returning();

    if (!approved) {
      writeSse(res, "Essa ação mudou de estado antes da aprovação. Nenhuma execução foi iniciada.", {
        jarvisAction: "approve",
        actionStatus: "state_changed",
      });
      return;
    }

    writeSse(
      res,
      `${actionLabel(task.actionType)} aprovada. Ela continua aguardando o comando explícito de execução porque o agente está em modo manual.`,
      { jarvisAction: "approve", actionStatus: approved.status, taskId: task.id, autonomyLevel },
    );
  } catch (err) {
    req.log?.warn({ err, tenantId }, "jarvis: comando natural controlado falhou; seguindo para chat normal");
    next();
  }
});

export default router;
