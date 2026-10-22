import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, agentConfigsTable, agentTasksTable, leadsTable } from "@workspace/db";
import type { AgentTask } from "@workspace/db";
import { parseJarvisEmailIntent, emailIntentMissingFields } from "../services/jarvis-email-action-intent.js";
import { sendJarvisEmail } from "../services/jarvis-email-provider.js";
import jarvisFastLiveCapabilitiesRouter from "./jarvis_fast_live_capabilities.js";
import jarvisDeviceActionsRouter from "./jarvis_device_actions.js";
import jarvisExternalActionsRouter from "./jarvis_external_actions.js";
import jarvisNaturalActionsRouter from "./jarvis_natural_actions.js";
import jarvisActionPlansRouter from "./jarvis_action_plans.js";
import jarvisMissionsRouter from "./jarvis_missions.js";
import supportRouter from "./support.js";

const router: IRouter = Router();
router.use(jarvisFastLiveCapabilitiesRouter);
router.use(jarvisDeviceActionsRouter);

function lastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const messages = Reflect.get(body, "messages");
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object" || Reflect.get(message, "role") !== "user") continue;
    const content = Reflect.get(message, "content");
    return typeof content === "string" ? content.trim() : null;
  }
  return null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isEmailApproval(text: string) {
  const value = normalize(text);
  return /^(aprova|aprove|aprovar|confirmo|confirmar|pode aprovar)(\b|[,.!?])/.test(value)
    && /\b(email|e-mail)\b/.test(value);
}

function isEmailRejection(text: string) {
  const value = normalize(text);
  return /^(rejeita|rejeite|rejeitar|recusa|recuse|cancelar|cancela|nao aprova|nao aprove)(\b|[,.!?])/.test(value)
    && /\b(email|e-mail)\b/.test(value);
}

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

async function executeEmailTask(task: AgentTask, log: any): Promise<AgentTask> {
  const payload = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  try {
    if (!to || !subject || !body) throw new Error("Payload de e-mail incompleto");
    const [lead] = await db.select({ id: leadsTable.id, email: leadsTable.email })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, task.leadId), eq(leadsTable.tenantId, task.tenantId)))
      .limit(1);
    if (!lead?.email || lead.email.toLowerCase() !== to.toLowerCase()) {
      throw new Error("Destinatário não corresponde ao e-mail atual do contato neste tenant");
    }

    const sent = await sendJarvisEmail({ to, subject, body });
    const [finished] = await db.update(agentTasksTable)
      .set({
        status: "concluido",
        result: { resendId: sent.id, to, subject },
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agentTasksTable.id, task.id), eq(agentTasksTable.tenantId, task.tenantId)))
      .returning();
    if (!finished) throw new Error("Não foi possível finalizar a tarefa de e-mail");
    log?.info?.({ taskId: task.id, resendId: sent.id, to }, "jarvis: email enviado pelo Resend");
    return finished;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro ao enviar e-mail";
    const [failed] = await db.update(agentTasksTable)
      .set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(and(eq(agentTasksTable.id, task.id), eq(agentTasksTable.tenantId, task.tenantId)))
      .returning();
    if (!failed) throw err;
    log?.error?.({ err, taskId: task.id }, "jarvis: envio de email falhou");
    return failed;
  }
}

async function approveEmailTask(tenantId: string, taskId: string, log: any) {
  const [task] = await db.select().from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.tenantId, tenantId))).limit(1);
  if (!task || task.actionType !== "enviar_email") return null;
  if (task.status !== "pendente_aprovacao" && task.status !== "aprovado") return task;
  const expected = task.status;
  const [executing] = await db.update(agentTasksTable)
    .set({ status: "executando", executedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agentTasksTable.id, task.id), eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.status, expected)))
    .returning();
  if (!executing) return null;
  return executeEmailTask(executing, log);
}

router.post("/tenants/:tenantId/agent-tasks/:id/approve", async (req, res, next) => {
  const tenantId = String(req.params.tenantId ?? "");
  const taskId = String(req.params.id ?? "");
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return next();
  const [task] = await db.select({ actionType: agentTasksTable.actionType, status: agentTasksTable.status })
    .from(agentTasksTable).where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.tenantId, tenantId))).limit(1);
  if (!task || task.actionType !== "enviar_email") return next();
  if (task.status !== "pendente_aprovacao") return res.status(422).json({ error: `Task cannot be approved from status "${task.status}"` });
  const finished = await approveEmailTask(tenantId, taskId, req.log);
  if (!finished) return res.status(409).json({ error: "Task state changed before approval could be applied" });
  return res.json({ ...finished, autonomyLevel: "human_approved" });
});

router.post("/tenants/:tenantId/agent-tasks/:id/execute", async (req, res, next) => {
  const tenantId = String(req.params.tenantId ?? "");
  const taskId = String(req.params.id ?? "");
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return next();
  const [task] = await db.select({ actionType: agentTasksTable.actionType, status: agentTasksTable.status })
    .from(agentTasksTable).where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.tenantId, tenantId))).limit(1);
  if (!task || task.actionType !== "enviar_email") return next();
  if (task.status !== "aprovado") return res.status(422).json({ error: `Task cannot be executed from status "${task.status}"` });
  const finished = await approveEmailTask(tenantId, taskId, req.log);
  if (!finished) return res.status(409).json({ error: "Task state changed before execution could be applied" });
  return res.json(finished);
});

router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

  if (isEmailApproval(text) || isEmailRejection(text)) {
    const pending = await db.select({ id: agentTasksTable.id, payload: agentTasksTable.payload })
      .from(agentTasksTable)
      .where(and(eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.actionType, "enviar_email"), eq(agentTasksTable.status, "pendente_aprovacao")))
      .orderBy(desc(agentTasksTable.createdAt)).limit(5);
    if (!pending.length) {
      writeSse(res, "Não há nenhum e-mail aguardando sua aprovação.");
      return;
    }
    if (pending.length > 1) {
      const options = pending.map((task, index) => {
        const p = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
        return `${index + 1}. ${String(p.subject ?? "E-mail")} → ${String(p.leadName ?? p.to ?? "destinatário")}`;
      }).join("\n");
      writeSse(res, `Há mais de um e-mail aguardando aprovação. Use a fila de aprovações para escolher qual deles:\n${options}`);
      return;
    }
    if (isEmailRejection(text)) {
      const [rejected] = await db.update(agentTasksTable).set({ status: "rejeitado", updatedAt: new Date() })
        .where(and(eq(agentTasksTable.id, pending[0]!.id), eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.status, "pendente_aprovacao"))).returning();
      writeSse(res, rejected ? "E-mail rejeitado. Nada foi enviado." : "O estado do e-mail mudou antes da rejeição.");
      return;
    }
    const finished = await approveEmailTask(tenantId, pending[0]!.id, req.log);
    if (!finished) {
      writeSse(res, "O estado do e-mail mudou antes da aprovação. Confira a fila de aprovações.");
      return;
    }
    if (finished.status === "concluido") {
      writeSse(res, "E-mail aprovado e enviado pelo provedor real com sucesso.", { agentTaskId: finished.id, status: finished.status });
    } else {
      writeSse(res, `Não consegui enviar o e-mail: ${finished.errorMessage ?? "erro de execução"}.`, { agentTaskId: finished.id, status: finished.status });
    }
    return;
  }

  let intent;
  try {
    intent = await parseJarvisEmailIntent(tenantId, text);
  } catch (err) {
    req.log?.warn({ err, tenantId }, "jarvis: falha ao interpretar pedido de email");
    return next();
  }
  if (!intent?.isEmailRequest) return next();
  const missing = emailIntentMissingFields(intent);
  if (missing.length) {
    writeSse(res, `Para preparar o e-mail preciso de: ${missing.join(" e ")}.`);
    return;
  }

  const query = intent.leadQuery!.trim();
  const like = `%${query.replace(/[%_]/g, "")}%`;
  const leads = await db.select({ id: leadsTable.id, nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), or(ilike(leadsTable.nome, like), ilike(leadsTable.email, like), ilike(leadsTable.telefone, like))))
    .limit(5);
  if (!leads.length) {
    writeSse(res, `Não encontrei "${query}" entre os contatos deste tenant.`);
    return;
  }
  if (leads.length > 1) {
    writeSse(res, `Encontrei mais de um contato compatível com "${query}". Qual deles?\n${leads.map((lead, i) => `${i + 1}. ${lead.nome}${lead.email ? ` — ${lead.email}` : ""}`).join("\n")}`);
    return;
  }

  const lead = leads[0]!;
  if (!lead.email) {
    writeSse(res, `${lead.nome} não possui e-mail cadastrado. Atualize o contato antes de enviar.`);
    return;
  }

  const [config] = await db.select({ agents: agentConfigsTable.agents }).from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId)).limit(1);
  if (!config?.agents?.service?.enabled && !config?.agents?.followup?.enabled) {
    writeSse(res, "Nenhum agente operacional de comunicação (Suporte ou Follow-up) está habilitado para este tenant.");
    return;
  }

  const [task] = await db.insert(agentTasksTable).values({
    tenantId,
    leadId: lead.id,
    agentName: config.agents.service?.enabled ? "service" : "followup",
    actionType: "enviar_email",
    payload: {
      to: lead.email,
      leadName: lead.nome,
      subject: intent.subject,
      body: intent.body,
      _jarvisExternalAction: {
        requestedBy: req.user?.sub ?? req.user?.sub ?? null,
        requestedAt: new Date().toISOString(),
        sourceText: text.slice(0, 1000),
      },
    },
    status: "pendente_aprovacao",
  }).returning();
  if (!task) {
    writeSse(res, "Não consegui preparar a tarefa de e-mail.");
    return;
  }

  writeSse(res, [
    `Preparei um e-mail para ${lead.nome} <${lead.email}>.`,
    `Assunto: ${intent.subject}`,
    `Mensagem:\n${intent.body}`,
    "Nada foi enviado ainda. O e-mail está aguardando sua aprovação; diga “aprova o e-mail” ou use a fila de aprovações.",
  ].join("\n\n"), { agentTaskId: task.id, actionType: task.actionType, status: task.status });
});

const downstreamChatRouters: IRouter[] = [
  jarvisExternalActionsRouter,
  jarvisNaturalActionsRouter,
  jarvisActionPlansRouter,
  jarvisMissionsRouter,
  supportRouter,
];

router.post("/support/chat", (req, res, next) => {
  let index = 0;
  const runNextStage = (err?: unknown): void => {
    if (err) {
      next(err);
      return;
    }
    const stage = downstreamChatRouters[index++];
    if (!stage) {
      next();
      return;
    }
    stage(req, res, runNextStage);
  };
  runNextStage();
});

export default router;
