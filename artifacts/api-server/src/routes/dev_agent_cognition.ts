import { Router } from "express";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import investigatorRouter from "./dev_agent_investigator";

const router = Router();
router.use(investigatorRouter);

const cognitionSchema = z.object({
  requestId: z.string().min(1).max(120),
  request: z.string().min(1).max(12000),
  route: z.string().min(1).max(500),
  recentMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(12000),
  })).max(12).optional().default([]),
});

type Intent = "conversation" | "question" | "diagnose" | "audit" | "improve" | "build" | "execute";
type Risk = "low" | "medium" | "high" | "critical";
type Cognition = {
  intent: Intent;
  shouldExecute: boolean;
  shouldInspectCode: boolean;
  needsApproval: boolean;
  risk: Risk;
  confidence: number;
  cognitiveEffort: number;
  objective: string;
  reasoningSummary: string;
  investigationPlan: string[];
  executionDirective?: string;
};

const COGNITION_SYSTEM_PROMPT = `Você é o Cérebro Executivo de Engenharia do VendorAI.
Você NÃO executa código. Você entende profundamente a intenção do Super Admin e decide o próximo passo técnico.

Atue simultaneamente como CTO, arquiteto de software, SRE, engenheiro de produto e revisor de segurança.

Classifique UMA intenção:
- conversation: saudação, confirmação, agradecimento ou conversa casual;
- question: dúvida que pode ser respondida sem mudar código;
- diagnose: bug/problema que precisa investigação;
- audit: auditoria/análise abrangente;
- improve: melhoria de algo existente;
- build: criação de função nova;
- execute: ordem explícita e suficientemente definida para mudar código.

Retorne JSON com:
intent, shouldExecute, shouldInspectCode, needsApproval, risk, confidence, cognitiveEffort, objective, reasoningSummary, investigationPlan, executionDirective.

Cognitive Effort Score:
1-2 conversa/dúvida simples; 3-4 UI/bug local; 5-6 múltiplos módulos/APIs; 7-8 arquitetura/banco/integrações importantes; 9 segurança/multi-tenant/pagamentos; 10 mudança estrutural crítica.

REGRAS:
1. Nunca transforme saudação/conversa casual em execução.
2. Modo autônomo ligado NÃO é autorização automática para executar qualquer mensagem.
3. Bug vago: diagnose + shouldInspectCode=true antes de execução.
4. “corrige isso”, “faz agora”, “melhora esta tela”: pode shouldExecute=true quando contexto suficiente e risco não crítico.
5. Auditoria normalmente investiga antes; “audita e corrige” pode executar correções claras e de baixo risco.
6. Preserve arquitetura e não crie módulos paralelos.
7. Segurança, autenticação, billing, pagamentos, schema/migrations, RLS, secrets, infraestrutura, alteração global ou destrutiva exigem aprovação.
8. Quanto menor a confiança, mais investigação deve preceder execução.
9. Responda SOMENTE JSON válido, sem markdown e sem cadeia de pensamento privada.`;

const CRITICAL_TERMS = /\b(auth|autentica[cç][aã]o|login global|billing|pagamento|payment|subscription|assinatura|rls|row level security|migration|migra[cç][aã]o|schema|secret|token de produ[cç][aã]o|credencial|railway|vercel|terraform|infraestrutura|excluir tenant|apagar banco|drop table|force push)\b/i;
const CASUAL_ONLY = /^(oi+|ol[aá]|opa|e aí|eai|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|ok|okay|certo|beleza|show|entendi|sim|não|nao)[!.? ]*$/i;

function normalizeCognition(value: any): Cognition {
  const intents = new Set<Intent>(["conversation", "question", "diagnose", "audit", "improve", "build", "execute"]);
  const risks = new Set<Risk>(["low", "medium", "high", "critical"]);
  const intent: Intent = intents.has(value?.intent) ? value.intent : "diagnose";
  const risk: Risk = risks.has(value?.risk) ? value.risk : "medium";
  const effort = Math.max(1, Math.min(10, Math.round(Number(value?.cognitiveEffort ?? 5))));
  return {
    intent,
    shouldExecute: Boolean(value?.shouldExecute),
    shouldInspectCode: Boolean(value?.shouldInspectCode),
    needsApproval: Boolean(value?.needsApproval),
    risk,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
    cognitiveEffort: effort,
    objective: String(value?.objective ?? "Entender a solicitação técnica").slice(0, 1000),
    reasoningSummary: String(value?.reasoningSummary ?? "Classificação conservadora da solicitação.").slice(0, 2000),
    investigationPlan: Array.isArray(value?.investigationPlan)
      ? value.investigationPlan.slice(0, 6).map((item: unknown) => String(item).slice(0, 500))
      : [],
    executionDirective: value?.executionDirective ? String(value.executionDirective).slice(0, 2000) : undefined,
  };
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Resposta cognitiva inválida");
  }
}

function applyStructuralPolicy(request: string, cognition: Cognition): Cognition {
  if (CRITICAL_TERMS.test(request)) {
    return {
      ...cognition,
      risk: "critical",
      needsApproval: true,
      shouldExecute: false,
      shouldInspectCode: true,
      cognitiveEffort: Math.max(cognition.cognitiveEffort, 9),
      reasoningSummary: `${cognition.reasoningSummary} Política estrutural: assunto crítico exige aprovação do Super Admin.`.slice(0, 2000),
    };
  }
  if (cognition.confidence < 0.55 && cognition.shouldExecute) {
    return {
      ...cognition,
      shouldExecute: false,
      shouldInspectCode: true,
      reasoningSummary: `${cognition.reasoningSummary} Execução adiada por baixa confiança; investigar primeiro.`.slice(0, 2000),
    };
  }
  return cognition;
}

router.post("/support/dev/cognition", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode usar o cérebro do Dev IA." });
  }

  const parsed = cognitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });

  const requestText = parsed.data.request.trim();
  if (CASUAL_ONLY.test(requestText)) {
    const cognition: Cognition = {
      intent: "conversation",
      shouldExecute: false,
      shouldInspectCode: false,
      needsApproval: false,
      risk: "low",
      confidence: 0.99,
      cognitiveEffort: 1,
      objective: "Conversar com o Super Admin",
      reasoningSummary: "Mensagem casual; nenhuma ação técnica é necessária.",
      investigationPlan: [],
    };
    return res.json({ success: true, cognition, engine: "fast-path" });
  }

  const context = {
    requestId: parsed.data.requestId,
    route: parsed.data.route,
    request: requestText,
    recentMessages: parsed.data.recentMessages,
  };

  try {
    let raw = "";
    let engine = "claude-sonnet-4-6";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        temperature: 0,
        system: COGNITION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(context) }],
      });
      raw = message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
    } catch (anthropicErr) {
      req.log?.warn({ err: anthropicErr }, "dev-ia cognition: anthropic falhou, usando fallback");
      engine = "gpt-4o-mini-fallback";
      const openai = await getOpenAIForTenant("");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: COGNITION_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(context) },
        ],
      });
      raw = completion.choices[0]?.message?.content ?? "{}";
    }

    const cognition = applyStructuralPolicy(requestText, normalizeCognition(parseJsonObject(raw)));
    return res.json({ success: true, cognition, engine });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia cognition failed");
    return res.status(500).json({ error: "Falha no cérebro cognitivo do Dev IA" });
  }
});

export default router;
