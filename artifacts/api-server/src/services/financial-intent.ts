/**
 * Financial intent classification service
 *
 * Detects when an incoming message from a "cliente" lead is about a financial
 * topic (valores, formas de pagamento, faturas, notas fiscais, condições
 * comerciais) so the router can hand off to the "financeiro" agent instead of
 * the generic "service" agent. Used by agent-dispatch.
 */
import { callOpenAI } from "../lib/ai-gateway.js";
import type { Logger } from "pino";

export interface FinancialIntentResult {
  isFinancial: boolean;
  confidence: number;
}

/**
 * Uses a lightweight AI call to determine if the incoming message is about
 * a financial topic (not a payment collection / overdue-invoice scenario —
 * that is handled separately via deal charge status, not this classifier).
 *
 * Triggers when:
 *  - Lead asks about price, payment methods, installments, invoices, receipts
 *  - Lead asks about contract/commercial conditions already agreed
 *  - Lead asks for a copy of an invoice, boleto, or nota fiscal
 */
export async function classifyFinancialIntent(
  mensagem: string,
  tenantId: string,
  log: Logger
): Promise<FinancialIntentResult> {
  const prompt =
    `Você é um classificador de intenção de mensagens de clientes já ativos (pós-venda).\n` +
    `Analise se a mensagem abaixo trata de um assunto FINANCEIRO: valores, formas de pagamento,\n` +
    `parcelamento, boleto, nota fiscal, segunda via de fatura, ou condições comerciais já contratadas.\n` +
    `\n` +
    `NÃO classifique como financeiro: dúvidas de suporte/uso do produto, reclamações operacionais,\n` +
    `ou assuntos comerciais de uma NOVA venda (isso é responsabilidade de outro agente).\n` +
    `\n` +
    `Regras:\n` +
    `- Só classifique como financeiro se tiver ALTA confiança (confidence >= 0.6)\n` +
    `- Se a mensagem for ambígua ou não relacionada, retorne isFinancial: false\n` +
    `\n` +
    `Mensagem do cliente:\n"${mensagem}"\n` +
    `\n` +
    `Responda APENAS em JSON válido (sem markdown):\n` +
    `{"isFinancial": true|false, "confidence": 0.0}`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 60, temperature: 0, log }
    );

    const raw = result.content
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as {
      isFinancial?: boolean;
      confidence?: number;
    };

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

    if (parsed.isFinancial === true && confidence >= 0.6) {
      log.info({ tenantId, confidence }, "financial-intent: financial query detected");
      return { isFinancial: true, confidence };
    }

    return { isFinancial: false, confidence };
  } catch (err) {
    log.warn({ err, tenantId }, "financial-intent: AI classification failed — defaulting to non-financial");
    return { isFinancial: false, confidence: 0 };
  }
}
