import { isAgentActive } from "../lib/agent-activation.js";
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  agentTasksTable,
  agentConfigsTable,
  dealsTable,
  leadsTable,
  usersTable,
  notificationsTable,
  activitiesTable,
  insertAgentTaskSchema,
  updateAgentTaskSchema,
  resolveAgentAutonomyLevel,
} from "@workspace/db";
import type { AgentTask, AgentType } from "@workspace/db";
import { z } from "zod";
import {
  sendOutgoingMessage,
  sendAgentAttachments,
  sendDirectWhatsAppMessage,
  LeadNotFoundError,
  type AgentAttachment,
} from "../services/omnichannel.js";
import { tenantAgentConfigsTable } from "@workspace/db";
import type { Logger } from "pino";
import { proposalAccepted } from "../lib/proposal-accepted.js";
import { runDealClosure, type ConfirmClosureBody } from "./confirm_closure.js";
import { triggerCloserStockRejectionOffer } from "../lib/agent-engine.js";
import {
  canAccessAgentTask,
  canAccessLead,
  canViewAllScopedData,
  leadOwnedByUserCondition,
} from "../lib/lead-scope-access.js";

const router: IRouter = Router();

// ── Payload schema for actionType="enviar_whatsapp" ──────────────────────────
const whatsappPayloadSchema = z.object({
  leadId: z.string().min(1),
  conteudo: z.string().min(1),
  agentName: z.string().optional(),
  agentKey: z.string().optional(),
  attachmentNames: z.array(z.string()).optional(),
  campaignImageObjectPath: z.string().optional(),
  canal: z
    .enum(["whatsapp", "instagram", "email", "chat"])
    .optional()
    .default("whatsapp"),
});

// ── Payload schema for actionType="aprovacao_fechamento" ─────────────────────
const aprovacaoFechamentoPayloadSchema = z.object({
  origin: z.enum(["proposal_accepted", "confirm_closure"]),
  dealId: z.string().min(1),
  propostaId: z.string().optional(),
  channel: z.enum(["link", "whatsapp", "manual"]).optional(),
  metadata: z
    .object({
      ip: z.string().optional(),
      nome: z.string().optional(),
      documento: z.string().optional(),
    })
    .nullable()
    .optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  vendedorNome: z.string().nullable().optional(),
});

// ── Payload schema for actionType="conferencia_estoque" ──────────────────────
const conferenciaEstoquePayloadSchema = z.object({
  origin: z.enum(["proposal_accepted", "confirm_closure"]),
  dealId: z.string().min(1),
  propostaId: z.string().optional(),
  channel: z.enum(["link", "whatsapp", "manual"]).optional(),
  metadata: z
    .object({
      ip: z.string().optional(),
      nome: z.string().optional(),
      documento: z.string().optional(),
    })
    .nullable()
    .optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  vendedorNome: z.string().nullable().optional(),
  etapaAnterior: z.string(),
  assignedUserId: z.string().nullable().optional(),
  itens: z.array(z.record(z.string(), z.unknown())).optional(),
});

const aprovacaoDescontoPayloadSchema = z.object({
  dealId: z.string().min(1),
  discountPercent: z.number().min(0).max(100),
  reason: z.string().min(3),
  originalValue: z.number(),
  discountedValue: z.number().min(0),
});

// ── Shared action executor ────────────────────────────────────────────────────
// Runs the action for a task that is already in "executando" status.
// Updates the task to "concluido" with result, or "erro" with errorMessage.
export async function executeTaskAction(
  task: AgentTask,
  log: Logger
): Promise<AgentTask> {
  if (task.actionType === "aprovacao_fechamento") {
    return executeAprovacaoFechamento(task, log);
  }

  if (task.actionType === "conferencia_estoque") {
    return executeConferenciaEstoque(task, log);
  }

  if (task.actionType === "aprovacao_desconto") {
    return executeAprovacaoDesconto(task, log);
  }

  if (task.actionType !== "enviar_whatsapp") {
    // Unknown action — mark as error so the task doesn't get stuck
    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "erro",
        errorMessage: `Unknown actionType: "${task.actionType}"`,
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();
    log.warn({ taskId: task.id, actionType: task.actionType }, "agent_task: unknown actionType");
    return updated;
  }

  // ── enviar_whatsapp ───────────────────────────────────────────────────────
  const parsedPayload = whatsappPayloadSchema.safeParse(task.payload ?? {});
  if (!parsedPayload.success) {
    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "erro",
        errorMessage: `Invalid payload: ${parsedPayload.error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();
    log.warn({ taskId: task.id }, "agent_task: invalid whatsapp payload");
    return updated;
  }

  const { leadId, conteudo, agentName, agentKey, attachmentNames, campaignImageObjectPath, canal } = parsedPayload.data;

  try {
    // Recheck at execution time: queued/approved work must respect a later switch-off
    // or human takeover. Never trust the agent identity carried in the payload.
    if (!(await isAgentActive(task.tenantId, task.agentName))) {
      throw new Error("AGENT_DISABLED: envio bloqueado porque o agente está desativado");
    }
    const [lead] = await db.select({
      humanLock: leadsTable.activeAgentLock,
      disabled: leadsTable.agenteDesativado,
    }).from(leadsTable).where(and(eq(leadsTable.tenantId, task.tenantId), eq(leadsTable.id, leadId))).limit(1);
    if (!lead || lead.humanLock === "human" || lead.disabled) {
      throw new Error("AGENT_BLOCKED: contato inexistente, desativado ou em atendimento humano");
    }
    const { message, telefoneDestino } = await sendOutgoingMessage(
      { tenantId: task.tenantId, leadId, conteudo, agentName, canal },
      log
    );

    // ── Send campaign image (if any) ─────────────────────────────────────────
    if (campaignImageObjectPath && telefoneDestino && canal === "whatsapp") {
      const ext = campaignImageObjectPath.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      await sendAgentAttachments(
        task.tenantId,
        telefoneDestino,
        [{ objectPath: campaignImageObjectPath, name: `imagem-campanha.${ext}`, mimeType }],
        log
      ).catch((err) => log.warn({ err }, "agent_task: failed to send campaign image (non-fatal)"));
    }

    // ── Send AI-chosen attachments (specific files the AI decided to send) ────
    if (agentKey && telefoneDestino && canal === "whatsapp" && attachmentNames && attachmentNames.length > 0) {
      const [tenantAgentCfg] = await db
        .select({ parametros: tenantAgentConfigsTable.parametros })
        .from(tenantAgentConfigsTable)
        .where(
          and(
            eq(tenantAgentConfigsTable.tenantId, task.tenantId),
            eq(tenantAgentConfigsTable.agentKey, agentKey)
          )
        )
        .limit(1);

      const params = (tenantAgentCfg?.parametros as Record<string, unknown> | null) ?? {};
      const allAttachments: AgentAttachment[] = Array.isArray(params["attachments"])
        ? (params["attachments"] as AgentAttachment[]).filter((a) => a?.objectPath && a?.name)
        : [];

      // Match only the specific files the AI chose (by exact name)
      const chosen = allAttachments.filter((a) => attachmentNames.includes(a.name));

      if (chosen.length > 0) {
        log.info({ agentKey, chosen: chosen.map((a) => a.name) }, "agent_task: sending AI-chosen attachments");
        await sendAgentAttachments(task.tenantId, telefoneDestino, chosen, log);
      } else {
        log.warn({ agentKey, attachmentNames }, "agent_task: AI requested attachments not found in config");
      }
    }

    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "concluido",
        result: { messageId: message.id, telefoneDestino },
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.info(
      { taskId: task.id, messageId: message.id },
      "agent_task: enviar_whatsapp concluido"
    );
    return updated;
  } catch (err) {
    const errorMessage =
      err instanceof LeadNotFoundError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error during task execution";

    const [updated] = await db
      .update(agentTasksTable)
      .set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.error({ taskId: task.id, err }, "agent_task: execution failed");
    return updated;
  }
}

async function executeAprovacaoDesconto(task: AgentTask, log: Logger): Promise<AgentTask> {
  const parsed = aprovacaoDescontoPayloadSchema.safeParse(task.payload ?? {});
  if (!parsed.success) {
    const [updated] = await db.update(agentTasksTable).set({ status: "erro", errorMessage: parsed.error.message, updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id)).returning();
    return updated;
  }
  try {
    const [deal] = await db.update(dealsTable).set({ valor: String(parsed.data.discountedValue.toFixed(2)), updatedAt: new Date() })
      .where(and(eq(dealsTable.id, parsed.data.dealId), eq(dealsTable.tenantId, task.tenantId))).returning();
    if (!deal) throw new Error("Negócio não encontrado para aplicar o desconto");
    await db.insert(activitiesTable).values({
      tenantId: task.tenantId, leadId: task.leadId, dealId: deal.id, tipo: "tarefa",
      titulo: `Desconto de ${parsed.data.discountPercent}% aprovado pela gerência`,
      descricao: `Valor anterior: R$ ${parsed.data.originalValue.toFixed(2)}. Novo valor: R$ ${parsed.data.discountedValue.toFixed(2)}. Justificativa: ${parsed.data.reason}`,
      status: "concluida", concluidaEm: new Date(),
    });
    const [updated] = await db.update(agentTasksTable).set({ status: "concluido", result: { dealId: deal.id, appliedValue: parsed.data.discountedValue }, executedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id)).returning();
    return updated;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro ao aplicar desconto";
    const [updated] = await db.update(agentTasksTable).set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id)).returning();
    log.error({ err, taskId: task.id }, "agent_task: aprovacao_desconto failed");
    return updated;
  }
}

// ── aprovacao_fechamento ───────────────────────────────────────────────────────
// Re-runs the deal closure that was held pending manual approval (valor
// divergente do catálogo). Dispatches to the same code path the original
// request would have taken, skipping the catalog check this time since a
// human already reviewed the divergence.
async function executeAprovacaoFechamento(task: AgentTask, log: Logger): Promise<AgentTask> {
  const parsedPayload = aprovacaoFechamentoPayloadSchema.safeParse(task.payload ?? {});
  if (!parsedPayload.success) {
    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "erro",
        errorMessage: `Invalid payload: ${parsedPayload.error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();
    log.warn({ taskId: task.id }, "agent_task: invalid aprovacao_fechamento payload");
    return updated;
  }

  const { origin, dealId, propostaId, channel, metadata, body, vendedorNome } = parsedPayload.data;

  try {
    let result: unknown;

    if (origin === "confirm_closure") {
      result = await runDealClosure(
        dealId,
        (body ?? {}) as ConfirmClosureBody,
        { vendedorNome: vendedorNome ?? undefined },
        log
      );
    } else {
      if (!propostaId) {
        throw new Error("aprovacao_fechamento: propostaId ausente para origin=proposal_accepted");
      }
      result = await proposalAccepted(propostaId, channel ?? "manual", metadata ?? undefined, {
        skipApprovalCheck: true,
      });
    }

    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "concluido",
        result: result as Record<string, unknown>,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.info({ taskId: task.id, dealId }, "agent_task: aprovacao_fechamento concluido");
    return updated;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error during closure execution";
    const [updated] = await db
      .update(agentTasksTable)
      .set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.error({ taskId: task.id, err }, "agent_task: aprovacao_fechamento failed");
    return updated;
  }
}

// ── conferencia_estoque ────────────────────────────────────────────────────────
// Re-runs the deal closure that was paused pending manual stock confirmation.
// Dispatches to the same code path the original request would have taken,
// skipping the catalog + stock checks this time since a human already
// confirmed availability.
async function executeConferenciaEstoque(task: AgentTask, log: Logger): Promise<AgentTask> {
  const parsedPayload = conferenciaEstoquePayloadSchema.safeParse(task.payload ?? {});
  if (!parsedPayload.success) {
    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "erro",
        errorMessage: `Invalid payload: ${parsedPayload.error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();
    log.warn({ taskId: task.id }, "agent_task: invalid conferencia_estoque payload");
    return updated;
  }

  const { origin, dealId, propostaId, channel, metadata, body, vendedorNome } = parsedPayload.data;

  try {
    let result: unknown;

    if (origin === "confirm_closure") {
      result = await runDealClosure(
        dealId,
        (body ?? {}) as ConfirmClosureBody,
        { vendedorNome: vendedorNome ?? undefined },
        log
      );
    } else {
      if (!propostaId) {
        throw new Error("conferencia_estoque: propostaId ausente para origin=proposal_accepted");
      }
      result = await proposalAccepted(propostaId, channel ?? "manual", metadata ?? undefined, {
        skipApprovalCheck: true,
        skipStockCheck: true,
      });
    }

    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "concluido",
        result: result as Record<string, unknown>,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.info({ taskId: task.id, dealId }, "agent_task: conferencia_estoque aprovada e concluida");
    return updated;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error during closure execution";
    const [updated] = await db
      .update(agentTasksTable)
      .set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.error({ taskId: task.id, err }, "agent_task: conferencia_estoque failed");
    return updated;
  }
}

// ── conferencia_estoque rejeitada ──────────────────────────────────────────────
// Reverte o deal para a etapa anterior à conferência e notifica o responsável
// pelo negócio: vendedor atribuído (se houver) via WhatsApp, ou registro para
// o tenant_admin + reativação proativa do Closer para oferecer uma alternativa
// ao cliente (produto substituto, prazo maior, quantidade menor).
async function handleConferenciaEstoqueRejected(
  task: AgentTask,
  motivo: string | undefined,
  log: Logger
): Promise<void> {
  const parsedPayload = conferenciaEstoquePayloadSchema.safeParse(task.payload ?? {});
  if (!parsedPayload.success) {
    log.warn(
      { taskId: task.id },
      "agent_task: conferencia_estoque rejeitada com payload inválido, revert do deal pulado"
    );
    return;
  }

  const { dealId, etapaAnterior } = parsedPayload.data;

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
  if (!deal) {
    log.warn({ taskId: task.id, dealId }, "agent_task: conferencia_estoque rejeitada mas deal não encontrado");
    return;
  }

  await db
    .update(dealsTable)
    .set({ etapa: etapaAnterior as typeof dealsTable.$inferInsert.etapa, updatedAt: new Date() })
    .where(eq(dealsTable.id, dealId));

  const motivoTexto = motivo?.trim() || "Item sem estoque disponível";

  await db.insert(notificationsTable).values({
    tenantId: task.tenantId,
    recipientUserId: deal.assignedTo ?? null,
    leadId: deal.leadId ?? task.leadId,
    title: "Conferência de estoque reprovada",
    message: `A conferência de estoque do negócio "${deal.titulo}" foi reprovada. Motivo: ${motivoTexto}.`,
    type: "warning",
    category: "conferencia_estoque_reprovada",
  });

  try {
    if (deal.assignedTo) {
      const [vendedor] = await db
        .select({ telefone: usersTable.telefone })
        .from(usersTable)
        .where(eq(usersTable.id, deal.assignedTo));
      if (vendedor?.telefone) {
        const msg = `⚠️ Conferência de estoque reprovada\n\nO fechamento do negócio "${deal.titulo}" foi reprovado na conferência de estoque.\n\nMotivo: ${motivoTexto}\n\nO negócio voltou para a etapa de negociação — ofereça uma alternativa ao cliente.`;
        await sendDirectWhatsAppMessage(task.tenantId, vendedor.telefone, msg, log);
      }
    } else if (deal.leadId) {
      await triggerCloserStockRejectionOffer({
        tenantId: task.tenantId,
        leadId: deal.leadId,
        dealId: deal.id,
        motivo: motivoTexto,
        log,
      });
    }
  } catch (err) {
    log.warn(
      { err, taskId: task.id, dealId },
      "agent_task: notificação/reativação pós-rejeição de conferencia_estoque falhou (non-fatal)"
    );
  }

  log.info({ taskId: task.id, dealId, etapaAnterior }, "agent_task: conferencia_estoque rejeitada, deal revertido");
}

// ── POST /agent-tasks ─────────────────────────────────────────────────────────
router.post("/agent-tasks", async (req, res) => {
  const parsed = insertAgentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessLead(req, parsed.data.tenantId, parsed.data.leadId, "tasks:view_all"))) {
    res.status(403).json({ error: "Access denied to this lead task" });
    return;
  }

  const { tenantId, agentName } = parsed.data;

  const [config] = await db
    .select({ id: agentConfigsTable.id, agents: agentConfigsTable.agents })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!config) {
    res.status(422).json({ error: "No agent config found for this tenant" });
    return;
  }

  const agentEntry = config.agents?.[agentName as AgentType];
  if (!agentEntry?.enabled) {
    res.status(422).json({
      error: `Agent "${agentName}" is not enabled for this tenant`,
    });
    return;
  }

  const [task] = await db
    .insert(agentTasksTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(task);
});

// ── GET /tenants/:tenantId/agent-tasks ────────────────────────────────────────
router.get("/tenants/:tenantId/agent-tasks", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(agentTasksTable.tenantId, tenantId)];
  if (!(await canViewAllScopedData(req, "tasks:view_all"))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.json([]);
      return;
    }
    conditions.push(leadOwnedByUserCondition(userId, agentTasksTable.leadId));
  }

  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(and(...conditions))
    .orderBy(agentTasksTable.createdAt);
  res.json(tasks);
});

// ── GET /tenants/:tenantId/agent-tasks/pending ────────────────────────────────
router.get("/tenants/:tenantId/agent-tasks/pending", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [
    eq(agentTasksTable.tenantId, tenantId),
    eq(agentTasksTable.status, "pendente_aprovacao"),
  ];

  if (!(await canViewAllScopedData(req, "tasks:view_all"))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.json([]);
      return;
    }
    conditions.push(leadOwnedByUserCondition(userId, agentTasksTable.leadId));
  }

  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(and(...conditions))
    .orderBy(agentTasksTable.createdAt);
  res.json(tasks);
});

// ── POST /tenants/:tenantId/agent-tasks/:id/approve ───────────────────────────
// manual: aprovação mantém a tarefa em "aprovado" aguardando execução explícita.
// assistido/autonomo: executam após a aprovação humana.
// ações críticas abaixo sempre podem executar depois da aprovação humana, independentemente do nível.
router.post(
  "/tenants/:tenantId/agent-tasks/:id/approve",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [task] = await db
      .select()
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId))
        )
      );

    if (!task) {
      res.status(404).json({ error: "Agent task not found" });
      return;
    }

    if (!(await canAccessAgentTask(req, String(tenantId), task.id))) {
      res.status(403).json({ error: "Access denied to this agent task" });
      return;
    }

    if (task.status !== "pendente_aprovacao") {
      res.status(422).json({
        error: `Task cannot be approved from status "${task.status}"`,
      });
      return;
    }

    const [config] = await db
      .select({
        id: agentConfigsTable.id,
        autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
        agents: agentConfigsTable.agents,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, String(tenantId)));

    const now = new Date();
    const legacyAutonomyEnabled = Boolean(config?.autonomyEnabledAt && config.autonomyEnabledAt <= now);
    const autonomyLevel = resolveAgentAutonomyLevel(config?.agents, task.agentName, legacyAutonomyEnabled);
    const requiresHumanApproval =
      task.actionType === "aprovacao_fechamento" ||
      task.actionType === "aprovacao_desconto" ||
      task.actionType === "conferencia_estoque";
    const shouldExecuteNow = autonomyLevel !== "manual" || requiresHumanApproval;

    if (shouldExecuteNow) {
      // Move to "executando" first, then run the action. For sensitive actions,
      // reaching this point means a human has just approved the task.
      const [executing] = await db
        .update(agentTasksTable)
        .set({ status: "executando", executedAt: now, updatedAt: now })
        .where(and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId)),
          eq(agentTasksTable.status, "pendente_aprovacao"),
        ))
        .returning();

      if (!executing) {
        res.status(409).json({ error: "Task state changed before approval could be applied" });
        return;
      }

      const finished = await executeTaskAction(executing, req.log);
      res.json({ ...finished, autonomyLevel });
    } else {
      const [updated] = await db
        .update(agentTasksTable)
        .set({ status: "aprovado", updatedAt: now })
        .where(and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId)),
          eq(agentTasksTable.status, "pendente_aprovacao"),
        ))
        .returning();

      if (!updated) {
        res.status(409).json({ error: "Task state changed before approval could be applied" });
        return;
      }

      res.json({ ...updated, autonomyLevel });
    }
  }
);

// ── POST /tenants/:tenantId/agent-tasks/:id/execute ───────────────────────────
// Explicitly executes a task in "aprovado" status.
// Useful for manual tasks or future action types that need explicit execution.
router.post(
  "/tenants/:tenantId/agent-tasks/:id/execute",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [task] = await db
      .select()
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId))
        )
      );

    if (!task) {
      res.status(404).json({ error: "Agent task not found" });
      return;
    }

    if (!(await canAccessAgentTask(req, String(tenantId), task.id))) {
      res.status(403).json({ error: "Access denied to this agent task" });
      return;
    }

    if (task.status !== "aprovado") {
      res.status(422).json({
        error: `Task cannot be executed from status "${task.status}" — must be "aprovado"`,
      });
      return;
    }

    // Move to "executando"
    const [executing] = await db
      .update(agentTasksTable)
      .set({ status: "executando", executedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentTasksTable.id, String(id)))
      .returning();

    const finished = await executeTaskAction(executing, req.log);
    res.json(finished);
  }
);

// ── POST /tenants/:tenantId/agent-tasks/:id/reject ────────────────────────────
router.post(
  "/tenants/:tenantId/agent-tasks/:id/reject",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [task] = await db
      .select()
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId))
        )
      );

    if (!task) {
      res.status(404).json({ error: "Agent task not found" });
      return;
    }

    if (!(await canAccessAgentTask(req, String(tenantId), task.id))) {
      res.status(403).json({ error: "Access denied to this agent task" });
      return;
    }

    if (task.status !== "pendente_aprovacao") {
      res.status(422).json({
        error: `Task cannot be rejected from status "${task.status}"`,
      });
      return;
    }

    const [updated] = await db
      .update(agentTasksTable)
      .set({ status: "rejeitado", updatedAt: new Date() })
      .where(eq(agentTasksTable.id, String(id)))
      .returning();

    if (updated.actionType === "conferencia_estoque") {
      const motivo = typeof req.body?.motivo === "string" ? req.body.motivo : undefined;
      await handleConferenciaEstoqueRejected(updated, motivo, req.log);
    }

    if (updated.actionType === "aprovacao_desconto") {
      const payload = aprovacaoDescontoPayloadSchema.safeParse(updated.payload ?? {});
      if (payload.success) {
        await db.insert(activitiesTable).values({
          tenantId: updated.tenantId, leadId: updated.leadId, dealId: payload.data.dealId,
          tipo: "tarefa", titulo: "Desconto rejeitado pela gerência",
          descricao: typeof req.body?.motivo === "string" ? req.body.motivo : payload.data.reason,
          status: "concluida", concluidaEm: new Date(),
        });
      }
    }

    res.json(updated);
  }
);

// ── GET /agent-tasks/:id ──────────────────────────────────────────────────────
router.get("/agent-tasks/:id", async (req, res) => {
  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)));

  if (!task) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  if (!(await canAccessAgentTask(req, task.tenantId, task.id))) {
    res.status(403).json({ error: "Access denied to this agent task" });
    return;
  }

  res.json(task);
});

// ── PATCH /agent-tasks/:id ────────────────────────────────────────────────────
router.patch("/agent-tasks/:id", async (req, res) => {
  const parsed = updateAgentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: agentTasksTable.id, tenantId: agentTasksTable.tenantId })
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessAgentTask(req, existing.tenantId, existing.id))) {
    res.status(403).json({ error: "Access denied to this agent task" });
    return;
  }

  const [task] = await db
    .update(agentTasksTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentTasksTable.id, existing.id))
    .returning();

  res.json(task);
});

// ── DELETE /agent-tasks/:id ───────────────────────────────────────────────────
router.delete("/agent-tasks/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: agentTasksTable.id, tenantId: agentTasksTable.tenantId })
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessAgentTask(req, existing.tenantId, existing.id))) {
    res.status(403).json({ error: "Access denied to this agent task" });
    return;
  }

  await db.delete(agentTasksTable).where(eq(agentTasksTable.id, existing.id));

  res.status(204).send();
});

export default router;