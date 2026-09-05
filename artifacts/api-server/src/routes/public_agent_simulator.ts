import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import { buildReceptionPrompt, buildLeadSection, type AgentContext } from "../lib/agent-engine.js";
import { callOpenAI } from "../lib/ai-gateway.js";
import type { Lead } from "@workspace/db";

const router: IRouter = Router();
const INSTITUTIONAL_TENANT_ID = "1d4ea673-58d0-413a-a554-c9aca72a3121";
const MAX_TURNS = 14;

const simulatorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "Muitas mensagens. Tente novamente em alguns minutos." }),
});

const bodySchema = z.object({
  businessName: z.string().min(1).max(120),
  segment: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  locale: z.string().max(16).optional().default("pt-BR"),
  history: z.array(z.object({ from: z.enum(["lead", "agent"]), text: z.string().min(1).max(1000) })).max(MAX_TURNS),
});

function isSpanishLocale(locale: string) { return locale.toLowerCase().startsWith("es"); }

function buildSdrOverride(businessName: string, segment: string, description: string, locale: string): string {
  if (isSpanishLocale(locale)) {
    return (
      "Sos un SDR (representante de ventas) especialista y usás la metodología SPIN Selling de forma secuencial y consultiva.\n" +
      `\n## CONTEXTO DEL PRODUCTO\nRepresentás a la empresa "${businessName}", del segmento "${segment}".\nLo que vende/ofrece: ${description}\n` +
      "\n## REGLAS GENERALES\n" +
      `- Respondé en español natural del locale ${locale}; para es-PY usá español claro y cercano, evitando brasileñismos\n` +
      "- Máximo 2 párrafos cortos por mensaje\n" +
      "- Nunca inventes precio, plazo ni información específica que no fue proporcionada; si no sabés algo, decí que un especialista lo confirmará\n" +
      "\n## METODOLOGÍA SPIN SELLING — SECUENCIA OBLIGATORIA\n" +
      "Seguí siempre S → P → I → N y hacé UNA sola pregunta por etapa. No saltees etapas. Si la respuesta es breve, tratala como válida. Al completar SPIN, sugerí el próximo paso: reunión, propuesta o contacto con un especialista."
    );
  }

  return (
    "Você é um SDR (representante de vendas) especialista, utilizando a metodologia SPIN Selling de forma sequencial e consultiva.\n" +
    `\n## CONTEXTO DO PRODUTO\nVocê representa a empresa "${businessName}", que atua no segmento "${segment}".\nO que essa empresa vende/oferece: ${description}\n` +
    "\n## REGRAS GERAIS\n- Responda em português brasileiro\n- Máximo 2 parágrafos curtos por mensagem\n- Nunca invente preço, prazo ou informação específica que não foi dada acima\n" +
    "\n## METODOLOGIA SPIN SELLING\nSiga sempre S → P → I → N, com UMA pergunta por etapa. Não pule etapas. Depois de completar S-P-I-N, sugira o próximo passo."
  );
}

router.post("/public/agent-simulator", simulatorLimiter, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: "Dados inválidos." }); return; }
  const { businessName, segment, description, history, locale } = parsed.data;
  const spanish = isSpanishLocale(locale);
  const agentTurns = history.filter((h) => h.from === "agent").length;
  const agentName: "reception" | "sdr" = agentTurns === 0 ? "reception" : "sdr";

  if (agentTurns >= MAX_TURNS / 2) {
    res.json({
      reply: spanish
        ? "¿Te gustó la conversación? Esto es exactamente cómo un cliente tuyo puede ser atendido las 24 horas. ¿Querés probarlo con tu operación real?"
        : "Curtiu a conversa? Isso que você acabou de ver é literalmente como um cliente seu seria atendido, 24h por dia. Bora testar com sua operação de verdade?",
      agentName,
      limitReached: true,
    });
    return;
  }

  const syntheticLead = {
    id: "sim", tenantId: INSTITUTIONAL_TENANT_ID, nome: spanish ? "Cliente" : "Cliente", empresa: null,
    tamanhoEquipe: null, status: "novo", objetivo: null, dorPrincipal: null, urgencia: null, orcamento: null,
    planoRecomendado: null, proximaAcao: null, businessActivity: null, businessSubActivity: null, businessDescription: null,
  } as unknown as Lead;

  const ctx: AgentContext = { lead: syntheticLead, ci: null, conversation: null, recentMessages: [] };
  const receptionContext = spanish
    ? `La empresa se llama "${businessName}", segmento "${segment}". Lo que vende/ofrece: ${description}. Respondé exclusivamente en español natural del locale ${locale}, manteniendo una atención breve, consultiva y sin brasileñismos.`
    : `A empresa se chama "${businessName}", segmento "${segment}". O que ela vende/oferece: ${description}`;

  const systemPrompt = agentName === "reception"
    ? `${buildReceptionPrompt(receptionContext, ctx)}\n\n${spanish ? `REGLA DE IDIOMA OBLIGATORIA: respondé solamente en español del locale ${locale}.` : "REGRA DE IDIOMA OBRIGATÓRIA: responda somente em português brasileiro."}`
    : `${buildSdrOverride(businessName, segment, description, locale)}\n\n${buildLeadSection(syntheticLead)}`;

  try {
    const result = await callOpenAI(INSTITUTIONAL_TENANT_ID, "agent_sdr", [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({ role: h.from === "lead" ? "user" as const : "assistant" as const, content: h.text })),
    ], { temperature: 0.7, maxTokens: 300 });
    const reply = result.content.replace(/\{\{handoff:[a-z0-9_]+\}\}/gi, "").trim();
    res.json({ reply, agentName });
  } catch (error) {
    req.log?.error({ err: error }, "agent-simulator failed");
    res.status(502).json({ error: spanish ? "No fue posible generar la respuesta ahora. Intentá nuevamente en unos instantes." : "Não foi possível gerar a resposta agora. Tenta de novo em instantes." });
  }
});

export default router;
