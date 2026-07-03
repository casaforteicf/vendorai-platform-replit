/**
 * Escalation detection service
 *
 * Detects when an incoming message should trigger automatic escalation
 * to a human agent. Used by agent-dispatch before running AI response.
 */
import { callOpenAI } from "../lib/ai-gateway.js";
import type { Logger } from "pino";
import type { AgentContext } from "../lib/agent-engine.js";

export interface EscalationResult {
  triggered: boolean;
  reason: string | null;
}

/**
 * Uses a lightweight AI call to determine if the incoming message should
 * escalate the conversation to a human agent.
 *
 * Triggers when:
 *  - Lead explicitly asks to speak with a human
 *  - Strongly negative sentiment (anger, intense frustration, cancellation threat)
 *  - Complex topic the AI clearly cannot resolve (legal, serious complaints)
 *  - Lead has repeated the same unanswered question 3+ times
 */
export async function detectEscalationTrigger(
  mensagem: string,
  ctx: AgentContext,
  tenantId: string,
  log: Logger
): Promise<EscalationResult> {
  const recent = ctx.recentMessages
    .slice(-6)
    .map((m) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`)
    .join("\n");

  const prompt =
    `Você é um classificador de escalação de atendimento. Analise se a mensagem abaixo justifica transferência para humano.\n` +
    `\n` +
    `Critérios para escalação (qualquer um basta):\n` +
    `1. Lead pede explicitamente para falar com pessoa/humano/atendente\n` +
    `2. Sentimento fortemente negativo: raiva, frustração intensa, ameaça de cancelar/processar\n` +
    `3. Assunto que IA claramente não pode resolver: assuntos legais, reclamações graves, dados sensíveis\n` +
    `4. Lead repete a mesma dúvida 3+ vezes sem ser atendido\n` +
    `\n` +
    `Histórico recente:\n` +
    `${recent || "(sem histórico)"}\n` +
    `\n` +
    `Nova mensagem do lead:\n` +
    `"${mensagem}"\n` +
    `\n` +
    `Responda APENAS em JSON válido (sem markdown):\n` +
    `{"escalate": true|false, "reason": "motivo_snake_case_ou_null"}\n` +
    `Razões válidas: pedido_humano, sentimento_negativo, assunto_complexo, insistencia_repetida`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 80, temperature: 0, log }
    );

    const raw = result.content
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { escalate?: boolean; reason?: string | null };

    if (parsed.escalate === true) {
      log.info({ tenantId, reason: parsed.reason }, "escalation: trigger detected");
      return { triggered: true, reason: parsed.reason ?? "motivo_desconhecido" };
    }

    return { triggered: false, reason: null };
  } catch (err) {
    log.warn({ err, tenantId }, "escalation: AI detection failed — not escalating");
    return { triggered: false, reason: null };
  }
}

/**
 * Generates a 3-line conversation summary to help the human agent
 * quickly understand the context before taking over.
 */
export async function generateHandoffSummary(
  ctx: AgentContext,
  mensagem: string,
  tenantId: string,
  log: Logger
): Promise<string> {
  const recent = ctx.recentMessages
    .slice(-10)
    .map((m) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`)
    .join("\n");

  const prompt =
    `Gere um resumo em 3 linhas do contexto da conversa abaixo para passar ao atendente humano.\n` +
    `Formato: "Lead: [nome] | Situação: [resumo] | Última mensagem: [mensagem]"\n` +
    `\n` +
    `Lead: ${ctx.lead.nome}\n` +
    `Histórico:\n${recent || "(sem histórico)"}\n` +
    `Mensagem que gerou escalação: "${mensagem}"`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 150, temperature: 0.3, log }
    );
    return result.content.trim();
  } catch (err) {
    log.warn({ err, tenantId }, "escalation: handoff summary generation failed");
    return `Lead: ${ctx.lead.nome} | Mensagem: "${mensagem.slice(0, 100)}"`;
  }
}
