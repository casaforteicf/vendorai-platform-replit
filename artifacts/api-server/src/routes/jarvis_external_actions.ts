import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  agentTasksTable,
  agendasTable,
  leadsTable,
} from "@workspace/db";
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

router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

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
  const like = `%${leadQuery.replace(/[%_]/g, "")} %`.replace(" %", "%");
  const leads = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.telefone, like),
      ),
    ))
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

  const [config] = await db
    .select({ agents: agentConfigsTable.agents })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);
  if (!config?.agents?.scheduler?.enabled) {
    writeSse(res, "O agente de agendamento está desativado para este tenant. Ative o Scheduler nas configurações de agentes antes de executar essa ação.");
    return;
  }

  const [agenda] = await db
    .select({ id: agendasTable.id, nome: agendasTable.nome, isDefault: agendasTable.isDefault })
    .from(agendasTable)
    .where(and(eq(agendasTable.tenantId, tenantId), isNotNull(agendasTable.googleRefreshToken)))
    .orderBy(desc(agendasTable.isDefault), agendasTable.createdAt)
    .limit(1);

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
      requestedBy: req.user?.id ?? req.user?.sub ?? null,
      requestedAt: new Date().toISOString(),
      sourceText: text.slice(0, 1000),
    },
  };

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      tenantId,
      leadId: lead.id,
      agentName: "scheduler",
      actionType: "criar_agendamento",
      payload,
      status: "pendente_aprovacao",
    })
    .returning();

  const dateLabel = start.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const timeLabel = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const calendarLabel = agenda ? ` na agenda ${agenda.nome}` : " na agenda interna do VendorAI";
  writeSse(
    res,
    `Preparei ${title} com ${lead.nome} para ${dateLabel} às ${timeLabel}${calendarLabel}. Como esse agendamento pode gerar convite externo, ele está aguardando sua aprovação. Você pode dizer “aprova o agendamento”.`,
    { agentTaskId: task.id, actionType: task.actionType, status: task.status },
  );
});

export default router;
