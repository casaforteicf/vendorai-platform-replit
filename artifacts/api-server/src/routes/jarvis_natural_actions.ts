import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, agentConfigsTable, agentTasksTable } from "@workspace/db";
import { executeTaskAction } from "./agent_tasks.js";
import { resolveJarvisNaturalAction } from "../services/jarvis-natural-action-intent.js";

const router: IRouter = Router();

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
      .select({ autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    const now = new Date();
    const isAutonomous = Boolean(config?.autonomyEnabledAt && config.autonomyEnabledAt <= now);
    const shouldExecuteNow =
      isAutonomous ||
      task.actionType === "enviar_whatsapp" ||
      task.actionType === "aprovacao_fechamento" ||
      task.actionType === "aprovacao_desconto" ||
      task.actionType === "conferencia_estoque";

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
        { jarvisAction: "approve", actionStatus: finished.status, taskId: task.id },
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
      `${actionLabel(task.actionType)} aprovada. Ela continua aguardando o comando explícito de execução.`,
      { jarvisAction: "approve", actionStatus: approved.status, taskId: task.id },
    );
  } catch (err) {
    req.log?.warn({ err, tenantId }, "jarvis: comando natural controlado falhou; seguindo para chat normal");
    next();
  }
});

export default router;
