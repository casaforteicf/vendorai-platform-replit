/**
 * Agent handoff service
 *
 * Generates a contextual summary of a conversation to pass from one AI agent
 * to the next when an agent handoff is detected (e.g. SDR → Closer).
 */
import { callOpenAI } from "../lib/ai-gateway.js";
import type { Logger } from "pino";
import type { AgentContext } from "../lib/agent-engine.js";

const AGENT_LABEL: Record<string, string> = {
  sdr:          "SDR",
  closer:       "Closer",
  service:      "Service (Suporte)",
  scheduler:    "Agendamento",
  reactivation: "Reativação",
  followup:     "Follow-up",
  onboarding:   "Onboarding",
  relacionamento: "Relacionamento",
  humano:       "Atendente humano",
};

export function agentLabel(name: string): string {
  return AGENT_LABEL[name] ?? name;
}

/**
 * Generates a 3-4 line summary of the conversation phase handled by `fromAgent`
 * to give `toAgent` enough context to continue without asking the lead to repeat
 * themselves.
 */
export async function generateAgentHandoffSummary(
  ctx: AgentContext,
  fromAgent: string,
  toAgent: string,
  tenantId: string,
  log: Logger
): Promise<string> {
  const recent = ctx.recentMessages
    .slice(-20)
    .map((m) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`)
    .join("\n");

  const prompt =
    `Você é um assistente que resume conversas de vendas/atendimento para passagem de bastão entre agentes.\n` +
    `\n` +
    `Agente anterior: ${agentLabel(fromAgent)}\n` +
    `Próximo agente: ${agentLabel(toAgent)}\n` +
    `Lead: ${ctx.lead.nome ?? "(sem nome)"}\n` +
    `\n` +
    `Histórico (últimas mensagens):\n` +
    `${recent || "(sem histórico)"}\n` +
    `\n` +
    `Resuma em 3-4 linhas APENAS:\n` +
    `1. O que o lead discutiu e suas principais necessidades\n` +
    `2. Objeções levantadas (se houver)\n` +
    `3. Nível de interesse e próximo passo esperado\n` +
    `\n` +
    `Seja direto e objetivo. Sem saudações. Sem formatação markdown.`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 200, temperature: 0.2, log }
    );
    return result.content.trim();
  } catch (err) {
    log.warn({ err, tenantId, fromAgent, toAgent }, "handoff: summary generation failed");
    return `Handoff de ${agentLabel(fromAgent)} para ${agentLabel(toAgent)}. Lead: ${ctx.lead.nome ?? "desconhecido"}.`;
  }
}
