/**
 * Bot detection service — Prospector cold outreach
 *
 * Classifies incoming replies in active prospector (scout_oportunidades)
 * conversations to detect automated bot/auto-responder patterns versus a real
 * human. Used by agent-dispatch to prevent AI↔bot loops and wasted credits.
 *
 * Signals of a bot:
 *   - Generic acknowledgement phrases ("obrigado pelo contato", "em breve retornaremos")
 *   - Numbered menu / multi-choice prompts ("digite 1 para...", "pressione 2...")
 *   - Response virtually identical to a previous auto-reply in the same conversation
 *
 * Signals of a real human:
 *   - Specific questions about the offer
 *   - First-person context that only a real person would give
 *   - Proper names, personal references, business-specific details
 */

import { callOpenAI } from "../lib/ai-gateway.js";
import type { Logger } from "pino";

export interface BotDetectionResult {
  isBot: boolean;
  isHuman: boolean;
  confidence: number;
}

/**
 * Default number of consecutive bot signals before the prospector pauses
 * and moves the oportunidade to "pendente_revisao_bot".
 * Can be overridden per-call if tenant config supports it.
 */
export const BOT_SIGNAL_THRESHOLD = 3;

/**
 * Classifies an incoming prospector reply as bot or human using a lightweight
 * LLM call — same pattern used by classifyFinancialIntent and detectEscalationTrigger.
 *
 * Falls back to { isBot: false, isHuman: false } on any error so the caller
 * always proceeds (fail-open = less disruptive than silently freezing a lead).
 */
export async function detectBotPattern(
  mensagem: string,
  recentMessages: Array<{ enviadoPor: string; conteudo: string }>,
  tenantId: string,
  log: Logger,
): Promise<BotDetectionResult> {
  const history = recentMessages
    .slice(-6)
    .map((m) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`)
    .join("\n");

  const prompt =
    `Você é um classificador especializado em detectar se uma resposta recebida numa\n` +
    `conversa de prospecção ativa veio de um BOT DE ATENDIMENTO AUTOMÁTICO ou de um HUMANO REAL.\n` +
    `\n` +
    `Sinais de BOT automático (qualquer um é suficiente com alta confiança):\n` +
    `- Frases genéricas de acuse de recebimento: "obrigado pelo contato", "recebemos sua mensagem",\n` +
    `  "em breve retornaremos", "sua mensagem foi registrada", "atendimento automático".\n` +
    `- Menu numerado ou de múltipla escolha: "digite 1 para...", "pressione 2", "escolha uma opção".\n` +
    `- Mensagem praticamente idêntica a outra já enviada pelo lead nesta mesma conversa\n` +
    `  (loop de auto-resposta).\n` +
    `\n` +
    `Sinais de HUMANO real (qualquer um é forte indicador):\n` +
    `- Pergunta específica sobre o produto/serviço oferecido.\n` +
    `- Nome próprio, dados pessoais ou contexto da empresa que só alguém de lá saberia.\n` +
    `- Resposta contextualizada à mensagem enviada pelo agente.\n` +
    `- Objeção, curiosidade ou negativa com argumentação pessoal.\n` +
    `\n` +
    `Regras:\n` +
    `- Só classifique como isBot=true se tiver confiança >= 0.75.\n` +
    `- Só classifique como isHuman=true se tiver confiança >= 0.65.\n` +
    `- isBot e isHuman não podem ser ambos true.\n` +
    `- Se ambíguo, retorne isBot:false, isHuman:false.\n` +
    `\n` +
    `Histórico recente da conversa:\n` +
    `${history || "(sem histórico anterior)"}\n` +
    `\n` +
    `Nova mensagem do lead:\n` +
    `"${mensagem}"\n` +
    `\n` +
    `Responda APENAS em JSON válido (sem markdown):\n` +
    `{"isBot": true|false, "isHuman": true|false, "confidence": 0.0}`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 60, temperature: 0, log },
    );

    const raw = result.content
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "");

    const parsed = JSON.parse(raw) as {
      isBot?: boolean;
      isHuman?: boolean;
      confidence?: number;
    };

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const isBot = parsed.isBot === true && !parsed.isHuman && confidence >= 0.75;
    const isHuman = parsed.isHuman === true && !parsed.isBot && confidence >= 0.65;

    if (isBot) {
      log.info({ tenantId, confidence }, "bot-detection: bot pattern detected in prospector reply");
    } else if (isHuman) {
      log.info({ tenantId, confidence }, "bot-detection: human confirmed in prospector reply");
    }

    return { isBot, isHuman, confidence };
  } catch (err) {
    log.warn({ err, tenantId }, "bot-detection: classification failed — defaulting to ambiguous (fail-open)");
    return { isBot: false, isHuman: false, confidence: 0 };
  }
}
