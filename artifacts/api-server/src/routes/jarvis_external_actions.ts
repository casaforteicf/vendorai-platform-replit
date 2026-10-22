import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  agentTasksTable,
  agendasTable,
  agendamentosTable,
  leadsTable,
} from "@workspace/db";
import type { AgentTask } from "@workspace/db";
import { createGoogleEvent } from "../lib/google-calendar.js";
import { parseJarvisCalendarIntent, calendarIntentMissingFields } from "../services/jarvis-calendar-action-intent.js";

const router: IRouter = Router();

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

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isCalendarApprovalText(text: string) {
  const normalized = normalize(text);
  return /^(aprova|aprove|aprovar|confirmo|confirmar|pode aprovar)(\b|[,.!?])/.test(normalized)
    && /\b(agenda|agendamento|reuniao|meet|horario)\b/.test(normalized);
}

function isCalendarRejectionText(text: string) {
  const normalized = normalize(text);
  return /^(rejeita|rejeite|rejeitar|recusa|recuse|cancelar|cancela|nao aprova|nao aprove)(\b|[,.!?])/.test(normalized)
    && /\b(agenda|agendamento|reuniao|meet|horario)\b/.test(normalized);
}

async function executeCalendarTask(task: AgentTask, log: any): Promise<AgentTask> {
  const payload = task.payload && typeof task.payload === "object"
    ? task.payload as Record<string, unknown>
    : {};
  const title = typeof payload.titulo === "string" ? payload.titulo.trim() : "";
  const start = typeof payload.dataHoraInicio === "string" ? new Date(payload.dataHoraInicio) : null;
  const end = typeof payload.dataHoraFim === "string" ? new Date(payload.dataHoraFim) : null;
  const agendaId = typeof payload.agendaId === "string" && payload.agendaId ? payload.agendaId : null;
  const modalidade = typeof payload.modalidade === "string" ? payload.modalidade : "meet";
  const gerarMeet = payload.gerarMeet === true;
  const local = typeof payload.local === "string" ? payload.local : null;
  const observacoes = typeof payload.observacoes === "string" ? payload.observacoes : null;

  try {
    if (!title || !start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error("Payload de agendamento inválido");
    }
    if (start <= new Date()) throw new Error("O horário do agendamento já passou");

    const [lead] = await db
      .select({ id: leadsTable.id, nome: leadsTable.nome, email: leadsTable.email })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, task.leadId), eq(leadsTable.tenantId, task.tenantId)))
      .limit(1);
    if (!lead) throw new Error("Lead não encontrado neste tenant");

    let validAgendaId: string | null = null;
    if (agendaId) {
      const [agenda] = await db
        .select({ id: agendasTable.id })
        .from(agendasTable)
        .where(and(eq(agendasTable.id, agendaId), eq(agendasTable.tenantId, task.tenantId)))
        .limit(1);
      if (!agenda) throw new Error("Agenda solicitada não pertence a este tenant");
      validAgendaId = agenda.id;
    }

    const [agendamento] = await db
      .insert(agendamentosTable)
      .values({
        tenantId: task.tenantId,
        agendaId: validAgendaId,
        leadId: task.leadId,
        tipo: "reuniao",
        modalidade,
        titulo: title,
        dataHoraInicio: start,
        dataHoraFim: end,
        local,
        observacoes,
        gerarMeet,
        criadoPor: "agente_ia",
        status: "agendado",
      })
      .returning();
    if (!agendamento) throw new Error("Não foi possível criar o agendamento");

    let googleEventId: string | null = null;
    let meetLink: string | null = null;
    let syncWarning: string | null = null;

    if (validAgendaId) {
      try {
        const sync = await createGoogleEvent(
          validAgendaId,
          {
            id: agendamento.id,
            tenantId: task.tenantId,
            titulo: agendamento.titulo,
            dataHoraInicio: agendamento.dataHoraInicio,
            dataHoraFim: agendamento.dataHoraFim,
            observacoes: agendamento.observacoes,
            local: agendamento.local,
            gerarMeet: agendamento.gerarMeet,
          },
          lead.nome,
          lead.email ?? undefined,
          gerarMeet,
        );
        googleEventId = sync.googleEventId;
        meetLink = sync.meetLink;
        if (googleEventId || meetLink) {
          await db
            .update(agendamentosTable)
            .set({ googleEventId, meetLink, updatedAt: new Date() })
            .where(and(eq(agendamentosTable.id, agendamento.id), eq(agendamentosTable.tenantId, task.tenantId)));
        } else {
          syncWarning = "Agendamento interno criado, mas o Google Calendar não retornou evento/Meet.";
        }
      } catch (err) {
        syncWarning = `Agendamento interno criado, mas a sincronização Google falhou: ${err instanceof Error ? err.message : "erro desconhecido"}`;
        log?.warn?.({ err, taskId: task.id, agendamentoId: agendamento.id }, "jarvis: Google Calendar sync não bloqueou agendamento interno");
      }
    }

    const [finished] = await db
      .update(agentTasksTable)
      .set({
        status: "concluido",
        result: {
          agendamentoId: agendamento.id,
          googleEventId,
          meetLink,
          syncWarning,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agentTasksTable.id, task.id), eq(agentTasksTable.tenantId, task.tenantId)))
      .returning();
    if (!finished) throw new Error("Não foi possível finalizar a tarefa de agendamento");

    log?.info?.({ taskId: task.id, agendamentoId: agendamento.id, googleEventId, meetLink, syncWarning }, "jarvis: agendamento concluído");
    return finished;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro ao criar agendamento";
    const [failed] = await db
      .update(agentTasksTable)
      .set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(and(eq(agentTasksTable.id, task.id), eq(agentTasksTable.tenantId, task.tenantId)))
      .returning();
    if (!failed) throw err;
    log?.error?.({ err, taskId: task.id }, "jarvis: agendamento falhou antes de conclusão");
    return failed;
  }
}

async function approveCalendarTask(tenantId: string, taskId: string, log: any) {
  const [task] = await db.select().from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.tenantId, tenantId))).limit(1);
  if (!task || task.actionType !== "criar_agendamento") return null;
  if (task.status !== "pendente_aprovacao" && task.status !== "aprovado") return task;

  const expectedStatus = task.status;
  const [executing] = await db.update(agentTasksTable)
    .set({ status: "executando", executedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agentTasksTable.id, task.id), eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.status, expectedStatus)))
    .returning();
  if (!executing) return null;
  return executeCalendarTask(executing, log);
}

router.post("/tenants/:tenantId/agent-tasks/:id/approve", async (req, res, next) => {
  const tenantId = String(req.params.tenantId ?? "");
  const taskId = String(req.params.id ?? "");
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return next();
  const [task] = await db.select({ actionType: agentTasksTable.actionType, status: agentTasksTable.status })
    .from(agentTasksTable).where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.tenantId, tenantId))).limit(1);
  if (!task || task.actionType !== "criar_agendamento") return next();
  if (task.status !== "pendente_aprovacao") return res.status(422).json({ error: `Task cannot be approved from status "${task.status}"` });
  const finished = await approveCalendarTask(tenantId, taskId, req.log);
  if (!finished) return res.status(409).json({ error: "Task state changed before approval could be applied" });
  return res.json({ ...finished, autonomyLevel: "human_approved" });
});

router.post("/tenants/:tenantId/agent-tasks/:id/execute", async (req, res, next) => {
  const tenantId = String(req.params.tenantId ?? "");
  const taskId = String(req.params.id ?? "");
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return next();
  const [task] = await db.select({ actionType: agentTasksTable.actionType, status: agentTasksTable.status })
    .from(agentTasksTable).where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.tenantId, tenantId))).limit(1);
  if (!task || task.actionType !== "criar_agendamento") return next();
  if (task.status !== "aprovado") return res.status(422).json({ error: `Task cannot be executed from status "${task.status}"` });
  const finished = await approveCalendarTask(tenantId, taskId, req.log);
  if (!finished) return res.status(409).json({ error: "Task state changed before execution could be applied" });
  return res.json(finished);
});

router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

  if (isCalendarApprovalText(text) || isCalendarRejectionText(text)) {
    const pending = await db
      .select({ id: agentTasksTable.id, payload: agentTasksTable.payload, status: agentTasksTable.status })
      .from(agentTasksTable)
      .where(and(eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.actionType, "criar_agendamento"), eq(agentTasksTable.status, "pendente_aprovacao")))
      .orderBy(desc(agentTasksTable.createdAt)).limit(5);

    if (!pending.length) {
      writeSse(res, "Não há nenhum agendamento aguardando sua aprovação.");
      return;
    }
    if (pending.length > 1) {
      const options = pending.map((task, index) => {
        const p = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
        const title = typeof p.titulo === "string" ? p.titulo : "Agendamento";
        const start = typeof p.dataHoraInicio === "string" ? new Date(p.dataHoraInicio) : null;
        const when = start && Number.isFinite(start.getTime())
          ? `${start.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`
          : "horário não identificado";
        return `${index + 1}. ${title} — ${when}`;
      }).join("\n");
      writeSse(res, `Há mais de um agendamento aguardando aprovação. Use a fila de aprovações para escolher qual deles:\n${options}`);
      return;
    }

    if (isCalendarRejectionText(text)) {
      const [rejected] = await db.update(agentTasksTable).set({ status: "rejeitado", updatedAt: new Date() })
        .where(and(eq(agentTasksTable.id, pending[0]!.id), eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.status, "pendente_aprovacao"))).returning();
      writeSse(res, rejected ? "Agendamento rejeitado. Nenhum evento foi criado." : "O estado do agendamento mudou antes da rejeição.", { agentTaskId: pending[0]!.id });
      return;
    }

    const finished = await approveCalendarTask(tenantId, pending[0]!.id, req.log);
    if (!finished) {
      writeSse(res, "O estado do agendamento mudou antes da aprovação. Confira a fila de aprovações.");
      return;
    }
    if (finished.status === "concluido") {
      const result = finished.result && typeof finished.result === "object" ? finished.result as Record<string, unknown> : {};
      const meetLink = typeof result.meetLink === "string" && result.meetLink ? ` Meet: ${result.meetLink}` : "";
      const warning = typeof result.syncWarning === "string" && result.syncWarning ? ` ${result.syncWarning}` : "";
      writeSse(res, `Agendamento aprovado e criado com sucesso.${meetLink}${warning}`, { agentTaskId: finished.id, status: finished.status });
    } else {
      writeSse(res, `Não consegui concluir o agendamento: ${finished.errorMessage ?? "erro de execução"}.`, { agentTaskId: finished.id, status: finished.status });
    }
    return;
  }

  let intent;
  try {
    intent = await parseJarvisCalendarIntent(tenantId, text);
  } catch (err) {
    req.log?.warn({ err, tenantId }, "jarvis: falha ao interpretar pedido de agenda");
    return next();
  }
  if (!intent?.isSchedulingRequest) return next();

  const missing = calendarIntentMissingFields(intent);
  if (missing.length) {
    writeSse(res, `Para preparar o agendamento preciso de: ${missing.join(" e ")}.`);
    return;
  }

  const start = new Date(intent.startIso!);
  const end = new Date(intent.endIso!);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    writeSse(res, "Não consegui determinar um intervalo válido para esse agendamento. Informe data, horário e, se quiser, a duração.");
    return;
  }
  if (start <= new Date()) {
    writeSse(res, "Esse horário já passou. Informe um horário futuro para eu preparar o agendamento.");
    return;
  }

  const leadQuery = intent.leadQuery!.trim();
  const like = `%${leadQuery.replace(/[%_]/g, "")}%`;
  const leads = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), or(ilike(leadsTable.nome, like), ilike(leadsTable.email, like), ilike(leadsTable.telefone, like))))
    .limit(5);

  if (!leads.length) {
    writeSse(res, `Não encontrei "${leadQuery}" entre os contatos deste tenant. Informe o nome, e-mail ou telefone cadastrado.`);
    return;
  }
  if (leads.length > 1) {
    const options = leads.map((lead, index) => `${index + 1}. ${lead.nome}${lead.email ? ` — ${lead.email}` : ""}`).join("\n");
    writeSse(res, `Encontrei mais de um contato compatível com "${leadQuery}". Qual deles?\n${options}`);
    return;
  }

  const [config] = await db.select({ agents: agentConfigsTable.agents }).from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId)).limit(1);
  if (!config?.agents?.scheduler?.enabled) {
    writeSse(res, "O agente de agendamento está desativado para este tenant. Ative o Scheduler nas configurações de agentes antes de executar essa ação.");
    return;
  }

  const [agenda] = await db
    .select({ id: agendasTable.id, nome: agendasTable.nome, isDefault: agendasTable.isDefault })
    .from(agendasTable)
    .where(and(eq(agendasTable.tenantId, tenantId), isNotNull(agendasTable.googleRefreshToken)))
    .orderBy(desc(agendasTable.isDefault), agendasTable.createdAt).limit(1);

  const lead = leads[0]!;
  const modality = intent.modality ?? "meet";
  const title = intent.title || `Reunião com ${lead.nome}`;
  const payload = {
    leadId: lead.id,
    agendaId: agenda?.id ?? null,
    titulo: title,
    dataHoraInicio: start.toISOString(),
    dataHoraFim: end.toISOString(),
    modalidade: modality,
    gerarMeet: modality === "meet",
    local: intent.location ?? null,
    observacoes: intent.notes ?? null,
    leadName: lead.nome,
    leadEmail: lead.email,
    _jarvisExternalAction: {
      requestedBy: req.user?.sub ?? req.user?.sub ?? null,
      requestedAt: new Date().toISOString(),
      sourceText: text.slice(0, 1000),
    },
  };

  const [task] = await db.insert(agentTasksTable).values({
    tenantId,
    leadId: lead.id,
    agentName: "scheduler",
    actionType: "criar_agendamento",
    payload,
    status: "pendente_aprovacao",
  }).returning();
  if (!task) {
    writeSse(res, "Não consegui preparar a tarefa de agendamento.");
    return;
  }

  const dateLabel = start.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const timeLabel = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const calendarLabel = agenda ? ` na agenda ${agenda.nome}` : " na agenda interna do VendorAI";
  writeSse(res, `Preparei ${title} com ${lead.nome} para ${dateLabel} às ${timeLabel}${calendarLabel}. Como esse agendamento pode gerar convite externo, ele está aguardando sua aprovação. Você pode dizer “aprova o agendamento”.`, {
    agentTaskId: task.id,
    actionType: task.actionType,
    status: task.status,
  });
});

export default router;
