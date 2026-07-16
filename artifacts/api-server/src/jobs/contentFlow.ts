/**
 * contentFlow — Job de execução de fluxos de nutrição do Prospector.
 *
 * triggerFlow(flowId, leadId): agenda execuções para cada step do fluxo.
 * processFlowExecutions(): processa execuções pendentes vencidas.
 * Cron: a cada 5 minutos via scheduler.ts.
 */
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import { Resend } from "resend";
import type { Logger } from "pino";
import {
  agentConfigsTable,
  db,
  partnerLeadsTable,
  prospectorFlowExecutionsTable,
  prospectorFlowStepsTable,
  prospectorFlowsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  generateMaterial,
  renderPrompt,
} from "../services/contentGenerator.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";

// ── triggerFlow ───────────────────────────────────────────────────────────────

/**
 * Busca todos os steps do fluxo (por ordem), calcula agendado_para
 * acumulando os delay_horas, e insere uma execução pendente para cada step.
 */
export async function triggerFlow(
  flowId: string,
  leadId: string,
): Promise<void> {
  const steps = await db
    .select()
    .from(prospectorFlowStepsTable)
    .where(eq(prospectorFlowStepsTable.flowId, flowId))
    .orderBy(asc(prospectorFlowStepsTable.ordem));

  if (steps.length === 0) {
    logger.info({ flowId, leadId }, "contentFlow/triggerFlow: sem steps, fluxo vazio");
    return;
  }

  const now = new Date();
  let accHours = 0;

  const executions = steps.map((step) => {
    accHours += step.delayHoras ?? 0;
    const agendadoPara = new Date(now.getTime() + accHours * 60 * 60 * 1000);
    return {
      flowId,
      leadId,
      stepId: step.id,
      status: "pendente",
      agendadoPara,
    };
  });

  await db.insert(prospectorFlowExecutionsTable).values(executions);

  logger.info(
    { flowId, leadId, executions: executions.length },
    "contentFlow/triggerFlow: execuções agendadas",
  );
}

// ── Internal: WhatsApp media ─────────────────────────────────────────────────

async function sendWhatsAppMedia(
  tenantId: string,
  phone: string,
  imageUrl: string,
  caption: string,
  log: Logger,
): Promise<void> {
  // Meta Cloud API text send with image link (image-only messages require media upload endpoint)
  const mensagem = caption ? `${caption}\n\n📎 ${imageUrl}` : `📎 ${imageUrl}`;
  await sendDirectWhatsAppMessage(tenantId, phone, mensagem, log);
  log.info({ phone }, "contentFlow: mensagem com link de imagem enviada via Meta Cloud API");
}

// ── Internal: Email via Resend ───────────────────────────────────────────────

async function sendProspectorEmail(
  to: string,
  mensagem: string,
  materialUrl: string | null,
  log: Logger,
): Promise<void> {
  const resend = process.env["RESEND_API_KEY"]
    ? new Resend(process.env["RESEND_API_KEY"])
    : null;

  if (!resend) {
    log.warn({ to }, "contentFlow: RESEND_API_KEY não configurado — e-mail ignorado");
    return;
  }

  const subject =
    mensagem.split("\n")[0]?.slice(0, 80) ?? "Material exclusivo para você";

  const bodyHtml = mensagem
    .split("\n")
    .map((l) => `<p style="margin:0 0 8px;color:#444;line-height:1.6;">${l}</p>`)
    .join("");

  const materialHtml = materialUrl
    ? `<p style="margin-top:24px;">
        <a href="${materialUrl}"
           style="display:inline-block;padding:10px 22px;background:#2563eb;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:600;">
          Ver material
        </a>
       </p>`
    : "";

  const { error } = await resend.emails.send({
    from: "VendorAI Prospector <noreply@vendorai.app>",
    to,
    subject,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;">
      ${bodyHtml}${materialHtml}
    </div>`,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  log.info({ to }, "contentFlow: e-mail enviado via Resend");
}

// ── processFlowExecutions ─────────────────────────────────────────────────────

/**
 * Processa execuções com status='pendente' e agendado_para <= agora.
 *
 * Para cada execução:
 *  a. Lead com status terminal → cancelado
 *  b. Atualiza status → 'gerando'
 *  c/d. Gera material por IA ou usa upload
 *  e. Renderiza mensagem
 *  f. Atualiza status → 'enviando'
 *  g. WhatsApp: envia mídia (imagem) ou texto+link
 *  h. Email: envia via Resend
 *  i. Atualiza status → 'enviado'
 *  err. Em caso de falha → 'falhou' + erro_msg
 */
export async function processFlowExecutions(log: Logger): Promise<void> {
  log.info("contentFlow/processFlowExecutions: iniciando");

  const now = new Date();

  const due = await db
    .select({
      exec: prospectorFlowExecutionsTable,
      step: prospectorFlowStepsTable,
      lead: partnerLeadsTable,
    })
    .from(prospectorFlowExecutionsTable)
    .innerJoin(
      prospectorFlowStepsTable,
      eq(prospectorFlowExecutionsTable.stepId, prospectorFlowStepsTable.id),
    )
    .innerJoin(
      partnerLeadsTable,
      eq(prospectorFlowExecutionsTable.leadId, partnerLeadsTable.id),
    )
    .where(
      and(
        eq(prospectorFlowExecutionsTable.status, "pendente"),
        lte(prospectorFlowExecutionsTable.agendadoPara, now),
      ),
    );

  if (due.length === 0) {
    log.info("contentFlow/processFlowExecutions: sem execuções vencidas");
    return;
  }

  log.info({ count: due.length }, "contentFlow/processFlowExecutions: processando");

  for (const { exec, step, lead } of due) {
    const xlog = log.child({ execId: exec.id, stepId: step.id, leadId: lead.id });

    try {
      // a. Lead em status terminal → cancelar
      if (["respondeu", "qualificado", "perdido"].includes(lead.status)) {
        await db
          .update(prospectorFlowExecutionsTable)
          .set({ status: "cancelado" })
          .where(eq(prospectorFlowExecutionsTable.id, exec.id));
        xlog.info(
          { leadStatus: lead.status },
          "contentFlow: lead em status terminal — execução cancelada",
        );
        continue;
      }

      // adaptive: verifica se step anterior foi enviado mas não aberto
      let previousNotOpened = false;
      try {
        const [prevExec] = await db
          .select({
            abertaEm: prospectorFlowExecutionsTable.abertaEm,
            executadoEm: prospectorFlowExecutionsTable.executadoEm,
          })
          .from(prospectorFlowExecutionsTable)
          .where(
            and(
              eq(prospectorFlowExecutionsTable.leadId, exec.leadId),
              eq(prospectorFlowExecutionsTable.flowId, exec.flowId),
              eq(prospectorFlowExecutionsTable.status, "enviado"),
            )
          )
          .orderBy(desc(prospectorFlowExecutionsTable.executadoEm))
          .limit(1);
        if (prevExec?.executadoEm && !prevExec.abertaEm) {
          const hoursSince = (Date.now() - prevExec.executadoEm.getTime()) / 3600000;
          if (hoursSince >= 24) previousNotOpened = true;
        }
      } catch {
        // ignore — adaptive check is non-critical
      }

      // b. Gerando
      await db
        .update(prospectorFlowExecutionsTable)
        .set({ status: "gerando" })
        .where(eq(prospectorFlowExecutionsTable.id, exec.id));

      // c/d. Material
      let materialUrl: string | null = null;
      if (step.materialFonte === "ia" && step.materialTipo) {
        materialUrl = await generateMaterial(step, lead);
      } else if (step.materialFonte === "upload" && step.materialUploadUrl) {
        materialUrl = step.materialUploadUrl;
      }

      // e. Renderizar mensagem
      const leadVars: Record<string, string> = {
        nome: lead.nome,
        empresa: lead.empresa ?? "",
        telefone: lead.telefone ?? "",
        cidade: "",
        segmento: "",
      };
      let mensagem = step.mensagemTemplate
        ? renderPrompt(step.mensagemTemplate, leadVars)
        : "";

      if (previousNotOpened && mensagem) {
        mensagem = `Olá ${lead.nome}! 👋\n\nNotei que ainda não tive retorno sobre o que compartilhei antes. Quero garantir que você receba as informações certas.\n\n${mensagem}`;
      }

      // f. Enviando
      await db
        .update(prospectorFlowExecutionsTable)
        .set({ status: "enviando" })
        .where(eq(prospectorFlowExecutionsTable.id, exec.id));

      // g/h. Envio por canal
      const tenantId = lead.tenantId;

      let wamid: string | undefined;

      if (step.canal === "whatsapp") {
        if (!lead.telefone) throw new Error("Lead sem telefone para WhatsApp");
        if (!tenantId) throw new Error("Lead sem tenantId — não é possível enviar WhatsApp");

        const host = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0];
        const trackingUrl = host
          ? `https://${host}/api/track/c/${exec.id}`
          : materialUrl;

        if (materialUrl && step.materialTipo === "imagem") {
          await sendWhatsAppMedia(tenantId, lead.telefone, materialUrl, mensagem, xlog);
        } else {
          const texto = materialUrl
            ? `${mensagem}\n\n📎 ${trackingUrl ?? materialUrl}`.trim()
            : mensagem;
          wamid = await sendDirectWhatsAppMessage(tenantId, lead.telefone, texto, xlog) ?? undefined;
        }
      } else if (step.canal === "email") {
        if (!lead.email) throw new Error("Lead sem e-mail para envio");
        await sendProspectorEmail(lead.email, mensagem, materialUrl, xlog);
      } else {
        xlog.warn({ canal: step.canal }, "contentFlow: canal não suportado, pulando envio");
      }

      // i. Enviado
      await db
        .update(prospectorFlowExecutionsTable)
        .set({
          status: "enviado",
          executadoEm: new Date(),
          materialGeradoUrl: materialUrl,
          ...(wamid ? { wamid } : {}),
          ...(previousNotOpened ? { engajamentoAdaptado: true } : {}),
        })
        .where(eq(prospectorFlowExecutionsTable.id, exec.id));

      xlog.info({ canal: step.canal }, "contentFlow: execução concluída");
    } catch (err: unknown) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      xlog.error({ err }, "contentFlow: execução falhou");
      await db
        .update(prospectorFlowExecutionsTable)
        .set({ status: "falhou", erroMsg })
        .where(eq(prospectorFlowExecutionsTable.id, exec.id))
        .catch(() => {});
    }
  }

  log.info(
    { processed: due.length },
    "contentFlow/processFlowExecutions: ciclo concluído",
  );
}

// ── findBestFlow (helper for partnerProspector integration) ───────────────────

/**
 * Busca o melhor fluxo ativo para uma lista de nichos:
 * 1. Tenta match exato de segmento com cada nicho (em ordem)
 * 2. Fallback: flow com segmento vazio/null (fluxo padrão)
 */
export async function findBestFlow(
  nichos: string[],
): Promise<{ id: string; tenantId: string } | null> {
  for (const nicho of nichos) {
    const [flow] = await db
      .select({ id: prospectorFlowsTable.id, tenantId: prospectorFlowsTable.tenantId })
      .from(prospectorFlowsTable)
      .where(
        and(
          eq(prospectorFlowsTable.ativo, true),
          eq(prospectorFlowsTable.segmento, nicho),
        ),
      )
      .limit(1);
    if (flow) return flow;
  }

  // Default flow: segmento null or empty
  const [defaultFlow] = await db
    .select({ id: prospectorFlowsTable.id, tenantId: prospectorFlowsTable.tenantId })
    .from(prospectorFlowsTable)
    .where(
      and(
        eq(prospectorFlowsTable.ativo, true),
        or(isNull(prospectorFlowsTable.segmento), eq(prospectorFlowsTable.segmento, "")),
      ),
    )
    .limit(1);

  return defaultFlow ?? null;
}
