import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import { buildReceptionPrompt, buildLeadSection, type AgentContext } from "../lib/agent-engine.js";
import { callOpenAI } from "../lib/ai-gateway.js";
import type { Lead } from "@workspace/db";

const router: IRouter = Router();

// Cobrança/quota de IA fica atribuída ao tenant institucional (é o mesmo
// tenant que já vende o Vendor.ai) — assim o custo aparece no seu próprio
// painel de uso de IA, sem criar tenant fantasma nenhum.
const INSTITUTIONAL_TENANT_ID = "1d4ea673-58d0-413a-a554-c9aca72a3121";
const MAX_TURNS = 14; // ~7 idas e voltas — depois disso convida a continuar por WhatsApp

const simulatorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40, // por IP, por hora — cobre um teste real sem abrir espaço pra abuso
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "Muitas mensagens. Tente novamente em alguns minutos." }),
});

const bodySchema = z.object({
  businessName: z.string().min(1).max(120),
  segment: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  history: z.array(z.object({
    from: z.enum(["lead", "agent"]),
    text: z.string().min(1).max(1000),
  })).max(MAX_TURNS),
});

function buildSdrOverride(businessName: string, segment: string, description: string): string {
  return (
    "Você é um SDR (representante de vendas) especialista, utilizando a metodologia SPIN Selling de forma sequencial e consultiva.\n" +
    `\n## CONTEXTO DO PRODUTO\nVocê representa a empresa "${businessName}", que atua no segmento "${segment}".\nO que essa empresa vende/oferece: ${description}\n` +
    "\n## REGRAS GERAIS\n" +
    "- Responda em português brasileiro\n" +
    "- Máximo 2 parágrafos curtos por mensagem\n" +
    "- Nunca invente preço, prazo ou informação específica que não foi dada acima — se perguntarem algo que você não sabe, diga que um especialista vai confirmar\n" +
    "\n## METODOLOGIA SPIN SELLING — SEQUÊNCIA OBRIGATÓRIA\n" +
    "O fluxo de qualificação segue SEMPRE esta ordem, UMA PERGUNTA por etapa:\n\n" +
    "| Etapa | Objetivo | Quando fazer |\n" +
    "|-------|----------|--------------|\n" +
    "| S — Situação | Entender o cenário atual do cliente relacionado ao que a empresa vende | Sempre primeiro, se ainda não respondida |\n" +
    "| P — Problema | Identificar a principal dor ou dificuldade nesse cenário | Após o cliente responder S |\n" +
    "| I — Implicação | Explorar o impacto (tempo, dinheiro, risco) de não resolver isso | Após o cliente responder P |\n" +
    "| N — Necessidade | Provocar o desejo pela solução e mostrar valor | Após o cliente responder I |\n\n" +
    "## REGRAS RÍGIDAS DO SPIN\n" +
    "- NUNCA mude a ordem S → P → I → N\n" +
    "- NUNCA pule uma etapa antes do cliente responder a anterior\n" +
    "- NUNCA faça mais de uma pergunta na mesma mensagem\n" +
    "- Se a resposta for curta/informal, trate como resposta válida — não peça pra elaborar\n" +
    "- Depois de completar S-P-I-N, finalize sugerindo o próximo passo (reunião, proposta, ou falar com um especialista)"
  );
}

router.post("/public/agent-simulator", simulatorLimiter, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos." });
    return;
  }
  const { businessName, segment, description, history } = parsed.data;

  // Primeira mensagem = Agente de Recepção (acolhe, entende, encaminha).
  // A partir da segunda troca, passa pro SDR (qualifica via SPIN) — mesma
  // ordem real: reception → sdr, determinada por determineAgent() em produção.
  const agentTurns = history.filter((h) => h.from === "agent").length;
  const agentName: "reception" | "sdr" = agentTurns === 0 ? "reception" : "sdr";

  if (agentTurns >= MAX_TURNS / 2) {
    res.json({
      reply: "Curtiu a conversa? Isso que você acabou de ver é literalmente como um cliente seu seria atendido, 24h por dia. Bora testar com sua operação de verdade?",
      agentName,
      limitReached: true,
    });
    return;
  }

  const syntheticLead = {
    id: "sim",
    tenantId: INSTITUTIONAL_TENANT_ID,
    nome: "Cliente",
    empresa: null,
    tamanhoEquipe: null,
    status: "novo",
    objetivo: null,
    dorPrincipal: null,
    urgencia: null,
    orcamento: null,
    planoRecomendado: null,
    proximaAcao: null,
    businessActivity: null,
    businessSubActivity: null,
    businessDescription: null,
  } as unknown as Lead;

  const ctx: AgentContext = {
    lead: syntheticLead,
    ci: null,
    conversation: null,
    recentMessages: [],
  };

  const systemPrompt = agentName === "reception"
    ? buildReceptionPrompt(`A empresa se chama "${businessName}", segmento "${segment}". O que ela vende/oferece: ${description}`, ctx)
    : `${buildSdrOverride(businessName, segment, description)}\n\n${buildLeadSection(syntheticLead)}`;

  try {
    const result = await callOpenAI(
      INSTITUTIONAL_TENANT_ID,
      "agent_sdr",
      [
        { role: "system", content: systemPrompt },
        ...history.map((h) => ({ role: h.from === "lead" ? "user" as const : "assistant" as const, content: h.text })),
      ],
      { temperature: 0.7, maxTokens: 300 },
    );
    const reply = result.content.replace(/\{\{handoff:[a-z0-9_]+\}\}/gi, "").trim();
    res.json({ reply, agentName });
  } catch (error) {
    req.log?.error({ err: error }, "agent-simulator failed");
    res.status(502).json({ error: "Não foi possível gerar a resposta agora. Tenta de novo em instantes." });
  }
});

export default router;
