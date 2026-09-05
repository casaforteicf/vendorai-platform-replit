import { Router } from "express";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

const router = Router();

const cognitionSchema = z.object({
  requestId: z.string().min(1).max(120),
  request: z.string().min(1).max(12000),
  route: z.string().min(1).max(500),
  recentMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(12000),
  })).max(12).optional().default([]),
});

const COGNITION_SYSTEM_PROMPT = `Você é o Cérebro Executivo de Engenharia do VendorAI.
Sua responsabilidade NÃO é executar código. Sua responsabilidade é entender profundamente a intenção do Super Admin e decidir qual próximo passo técnico faz sentido.

Pense como CTO, arquiteto de software, SRE e revisor de segurança ao mesmo tempo.

Classifique cada solicitação em UMA intenção:
- conversation: saudação, conversa, confirmação, agradecimento, pergunta genérica sem necessidade técnica;
- question: dúvida técnica que pode ser respondida sem alterar código;
- diagnose: relato de bug/problema que exige investigação antes de qualquer alteração;
- audit: pedido de auditoria/análise abrangente;
- improve: melhoria de algo existente;
- build: criação de função nova;
- execute: comando explícito para executar uma correção/mudança já suficientemente definida.

Decida também:
- shouldExecute: true SOMENTE quando faz sentido iniciar trabalho real no repositório agora;
- shouldInspectCode: true quando precisa pesquisar código antes de responder/concluir;
- needsApproval: true quando houver risco crítico, destrutivo, autenticação, billing, pagamentos, schema/migrations/RLS, segredos, infraestrutura ou alteração global;
- risk: low | medium | high | critical;
- confidence: número de 0 a 1;
- objective: resumo técnico curto do objetivo;
- reasoningSummary: justificativa curta, sem cadeia de pensamento privada;
- investigationPlan: até 6 passos concretos;
- executionDirective: instrução curta para o executor, somente quando shouldExecute=true.

REGRAS:
1. Nunca transforme saudação ou conversa casual em execução.
2. Nunca execute só porque o modo autônomo está ligado.
3. Para bug vago como “isso está errado”, prefira diagnose + inspeção antes de executar.
4. Para “corrige isso”, “faz agora”, “melhora esta tela”, pode shouldExecute=true se a rota/contexto forem suficientes e o risco não for crítico.
5. Se a solicitação for auditoria, normalmente shouldExecute=false até a auditoria produzir achados claros; se o usuário disser explicitamente “audita e corrige”, pode executar correções de baixo risco.
6. Preserve arquitetura existente e evite módulos paralelos.
7. Responda SOMENTE JSON válido, sem markdown.`;

type Cognition = {
  intent: "conversation" | "question" | "diagnose" | "audit" | "improve" | "build" | "execute";
  shouldExecute: boolean;
  shouldInspectCode: boolean;
  needsApproval: boolean;
  risk: "low" | "medium" | "high" | "critical";
  confidence: number;
  objective: string;
  reasoningSummary: string;
  investigationPlan: string[];
  executionDirective?: string;
};

function normalizeCognition(value: any): Cognition {
  const intents = new Set(["conversation", "question", "diagnose", "audit", "improve", "build", "execute"]);
  const risks = new Set(["low", "medium", "high", "critical"]);
  return {
    intent: intents.has(value?.intent) ? value.intent : "diagnose",
    shouldExecute: Boolean(value?.shouldExecute),
    shouldInspectCode: Boolean(value?.shouldInspectCode),
    needsApproval: Boolean(value?.needsApproval),
    risk: risks.has(value?.risk) ? value.risk : "medium",
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
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

router.post("/support/dev/cognition", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode usar o cérebro do Dev IA." });
  }

  const parsed = cognitionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
  }

  const context = {
    requestId: parsed.data.requestId,
    route: parsed.data.route,
    request: parsed.data.request,
    recentMessages: parsed.data.recentMessages,
  };

  try {
    let raw = "";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        temperature: 0,
        system: COGNITION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(context) }],
      });
      raw = message.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");
    } catch (anthropicErr) {
      req.log?.warn({ err: anthropicErr }, "dev-ia cognition: anthropic falhou, usando fallback");
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

    const cognition = normalizeCognition(parseJsonObject(raw));
    return res.json({ success: true, cognition });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia cognition failed");
    return res.status(500).json({ error: "Falha no cérebro cognitivo do Dev IA" });
  }
});

export default router;
