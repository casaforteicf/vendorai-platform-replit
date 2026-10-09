import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { loadJarvisOperationalContext } from "../services/jarvis-operational-context.js";
import { buildJarvisCapabilityContext, JARVIS_UNIVERSAL_PROFILE } from "../services/jarvis-capability-profile.js";
import { executeJarvisProvider } from "../services/jarvis-provider-registry.js";
import { loadJarvisRequestContext } from "../services/jarvis-request-context.js";
import { loadJarvisContinuityContext, saveJarvisContinuity } from "../services/jarvis-continuity-memory.js";
import { resolveJarvisRoute } from "../services/jarvis-action-resolver.js";

const router: IRouter = Router();

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const presenceChatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
  conversationId: z.string().uuid().optional(),
  context: z.object({
    route: z.string().min(1).max(500).optional(),
    title: z.string().min(1).max(500).optional(),
  }).optional(),
  attachments: z.array(z.object({
    name: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(160),
    content: z.string().min(1).max(16000),
  })).max(3).optional(),
});

const PRESENCE_SYSTEM_PROMPT = `Você é o JARVIS, presença executiva e pessoal contínua dentro do VendorAI.

Sua função não é parecer um chatbot de suporte. Você funciona como braço direito: entende o contexto, mantém continuidade, antecipa o que importa, conversa naturalmente e aciona capacidades reais quando elas existem.

## Presença
- Fale como uma pessoa adulta, inteligente, próxima e objetiva; nunca como central de atendimento.
- Não se reapresente como JARVIS em toda conversa. Só explique quem é se perguntarem.
- Não termine automaticamente com “como posso ajudar?”, “por onde quer começar?” ou equivalentes.
- Se o usuário só cumprimentar, responda de forma humana e contextual. Se houver uma prioridade real relevante, cite no máximo uma; caso contrário, apenas converse.
- Use o primeiro nome quando ele estiver disponível no contexto autenticado, de forma natural e não repetitiva.
- Em conversa pessoal ou geral, não force o assunto de volta para o negócio.
- Se o usuário demonstrar preocupação, dúvida ou entusiasmo, responda ao assunto primeiro. Não transforme emoção em chamado de suporte.
- Se o usuário chamar você por outro nome em uma conversa casual, não interrompa para corrigi-lo. Só esclareça sua identidade se isso for relevante ou se ele perguntar.

## Modo executivo
Quando a pergunta envolver o negócio, opere como chief of staff e segunda visão:
1. diga a situação em uma frase;
2. traga os fatos/sinais mais relevantes disponíveis;
3. destaque risco, oportunidade ou ponto cego somente quando houver evidência;
4. recomende um caminho claro quando houver base suficiente;
5. proponha a próxima ação mais útil.
Não invente métrica, causa, impacto financeiro, cliente, compromisso, decisão ou execução ausente.

## Capacidades
- Antes de dizer “não consigo”, use o Capability Gateway e os providers reais já consultados nesta solicitação.
- Se um provider real foi executado, use o resultado dele e não contradiga dizendo que não há acesso.
- Ações reais já interceptadas por rotas anteriores (música, dispositivo, e-mail, agenda, WhatsApp, aprovações, missões etc.) não devem ser simuladas aqui.
- Nunca afirme execução sem confirmação da integração.

## Continuidade
- Considere mensagens anteriores, assunto anterior, tela atual, Missões, decisões, prioridades, radar, estado operacional e o bloco de continuidade persistente quando fornecidos no contexto.
- Resolva referências como “isso”, “aquele cliente”, “a missão”, “o que falamos” com o contexto disponível antes de pedir repetição.
- Não repita informação já dada, exceto quando necessário para uma decisão.
- Quando houver um assunto em andamento, continue dele naturalmente em vez de reiniciar a conversa.
- A memória de continuidade é apenas um fio de retomada. Dados atuais do negócio, entidades verificadas e providers reais sempre prevalecem quando houver conflito.
- Nunca revele ou misture memória pertencente a outro usuário ou tenant.

## Separação de suporte
Esta rota representa conversa/presença normal. Não gere protocolo, chamado, “atendimento registrado” nem marcador VENDORAI_REPORT. Problemas técnicos explícitos são encaminhados para o fluxo de suporte separado.

## Estilo
- Português brasileiro natural.
- Resposta proporcional ao pedido; simples quando simples, profunda quando a decisão exigir.
- Priorize utilidade, clareza e ação sobre frases de cortesia genéricas.`;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isJarvisSupportIncident(text: string): boolean {
  const value = normalize(text).trim();
  if (!value) return false;

  if (/\b(abrir|abra|registre|registrar|criar)\s+(um\s+)?(chamado|ticket|protocolo)\b/.test(value)) return true;
  if (/\b(reportar|relatar)\s+(um\s+)?(bug|erro|problema)\b/.test(value)) return true;
  if (/\b(bug|erro|falha|exception|stack trace|cors|403|404|500|502|503)\b/.test(value)) return true;
  if (/\b(travou|travando|congelou|loop infinito|tela bugada|nao carrega|nao abre|nao salva|nao conecta|nao funciona|parou de funcionar)\b/.test(value)) return true;
  if (/\b(problema|defeito)\b/.test(value) && /\b(tela|sistema|app|aplicativo|pagina|botao|campo|login|integracao|api|whatsapp|instagram|google|menu|layout)\b/.test(value)) return true;

  return false;
}

export function isSimpleJarvisGreeting(text: string): boolean {
  const value = normalize(text)
    .replace(/\b(jarvis|jade)\b/g, "")
    .replace(/[!,.?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(bom dia|boa tarde|boa noite|oi|ola|opa|e ai|fala|salve)$/.test(value);
}

function firstNameFromRequestContext(context: string): string | null {
  const match = context.match(/\bprimeiro_nome=([^|\n]+)/);
  const value = match?.[1]?.trim();
  return value && value !== "não_definido" ? value : null;
}

function greetingResponse(text: string, firstName: string | null): string {
  const value = normalize(text);
  const name = firstName ? `, ${firstName}` : "";
  if (value.includes("bom dia")) return `Bom dia${name}. Tô por aqui.`;
  if (value.includes("boa tarde")) return `Boa tarde${name}. Tô por aqui.`;
  if (value.includes("boa noite")) return `Boa noite${name}. Tô por aqui.`;
  return `Oi${name}. Tô por aqui.`;
}

function lastUserText(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
}

function setSseHeaders(res: any) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function flushSse(res: any) {
  if (typeof res.flush === "function") res.flush();
}

function interfaceContext(context?: { route?: string; title?: string }) {
  const lines = [
    context?.route || context?.title ? "## Contexto atual do VendorAI" : null,
    context?.route ? `- Rota: ${context.route}` : null,
    context?.title ? `- Título: ${context.title}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function attachmentContext(attachments?: Array<{ name: string; mimeType: string; content: string }>) {
  if (!attachments?.length) return "";
  return [
    "## Anexos desta conversa",
    "Use o conteúdo interpretado abaixo como evidência. Se estiver incompleto ou ilegível, diga isso.",
    ...attachments.map((item) => `### ${item.name} (${item.mimeType})\n${item.content}`),
  ].join("\n");
}

router.post("/support/chat", async (req, res, next) => {
  const parsed = presenceChatSchema.safeParse(req.body);
  if (!parsed.success) return next();

  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const userId = typeof req.user?.sub === "string" ? req.user.sub : null;
  const text = lastUserText(parsed.data.messages);
  if (!tenantId || !text) return next();
  if (isJarvisSupportIncident(text)) return next();

  const startedAt = Date.now();
  const resolution = resolveJarvisRoute(text);

  // Cumprimentos simples não precisam acionar provider, radar nem LLM. Isso evita
  // respostas artificiais e reduz drasticamente a latência percebida na abertura.
  if (isSimpleJarvisGreeting(text)) {
    let requestContext = "";
    try {
      requestContext = await loadJarvisRequestContext({
        tenantId,
        userId,
        route: parsed.data.context?.route ?? null,
      });
    } catch (err) {
      req.log?.warn({ err, tenantId }, "jarvis presence: identidade indisponível em cumprimento rápido");
    }

    const content = greetingResponse(text, firstNameFromRequestContext(requestContext));
    setSseHeaders(res);
    res.write(`data: ${JSON.stringify({ content })}\n\n`);
    res.write(`data: ${JSON.stringify({
      done: true,
      jarvisMode: "presence_fast_greeting",
      performance: { firstTokenMs: Date.now() - startedAt, providerMs: 0, totalMs: Date.now() - startedAt },
    })}\n\n`);
    res.end();
    return;
  }

  const providerStartedAt = Date.now();

  const [operationalResult, requestResult, providerResult, continuityResult] = await Promise.allSettled([
    loadJarvisOperationalContext(tenantId),
    loadJarvisRequestContext({
      tenantId,
      userId,
      route: parsed.data.context?.route ?? null,
    }),
    executeJarvisProvider(text, tenantId),
    loadJarvisContinuityContext(tenantId, userId),
  ]);

  const providerMs = Date.now() - providerStartedAt;
  const operationalContext = operationalResult.status === "fulfilled" ? operationalResult.value : "";
  const requestContext = requestResult.status === "fulfilled" ? requestResult.value : "";
  const providerContext = providerResult.status === "fulfilled"
    ? providerResult.value.context
    : "## Providers reais\nA consulta externa falhou nesta solicitação. Não invente informação atual.";
  const continuityContext = continuityResult.status === "fulfilled" ? continuityResult.value : "";

  if (operationalResult.status === "rejected") {
    req.log?.warn({ err: operationalResult.reason, tenantId }, "jarvis presence: contexto operacional indisponível");
  }
  if (requestResult.status === "rejected") {
    req.log?.warn({ err: requestResult.reason, tenantId }, "jarvis presence: contexto de requisição indisponível");
  }
  if (providerResult.status === "rejected") {
    req.log?.warn({ err: providerResult.reason, tenantId }, "jarvis presence: provider externo indisponível");
  }
  if (continuityResult.status === "rejected") {
    req.log?.warn({ err: continuityResult.reason, tenantId, userId }, "jarvis presence: memória de continuidade indisponível");
  }

  const capabilityContext = [
    buildJarvisCapabilityContext(text),
    providerContext,
    attachmentContext(parsed.data.attachments),
    `## Roteamento JARVIS`,
    `- rota: ${resolution.route}`,
    `- ação explícita: ${resolution.explicitAction ? "sim" : "não"}`,
    `- aprovação necessária: ${resolution.requiresApproval ? "sim" : "não"}`,
    `- motivo: ${resolution.reason}`,
    resolution.requiresApproval
      ? "Não execute uma ação sensível nesta camada sem a aprovação exigida; descreva a próxima ação e use o executor/fluxo de aprovação apropriado."
      : "",
  ].filter(Boolean).join("\n");

  const systemPrompt = [
    PRESENCE_SYSTEM_PROMPT,
    JARVIS_UNIVERSAL_PROFILE,
    requestContext,
    continuityContext,
    capabilityContext,
    interfaceContext(parsed.data.context),
    operationalContext,
  ].filter(Boolean).join("\n\n");

  setSseHeaders(res);
  let firstTokenAt: number | null = null;
  let fullResponse = "";

  const writeDelta = (delta: string) => {
    if (!delta) return;
    if (firstTokenAt == null) firstTokenAt = Date.now();
    fullResponse += delta;
    res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    flushSse(res);
  };

  try {
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 2600,
        system: systemPrompt,
        messages: parsed.data.messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          writeDelta(event.delta.text);
        }
      }
    } catch (anthropicError) {
      if (fullResponse) throw anthropicError;
      req.log?.warn({ err: anthropicError, tenantId }, "jarvis presence: Anthropic falhou, usando OpenAI");
      const openai = await getOpenAIForTenant(tenantId);
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2600,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...parsed.data.messages,
        ],
      });
      for await (const chunk of stream) writeDelta(chunk.choices[0]?.delta?.content ?? "");
    }

    // Persistência fora do caminho crítico: o usuário recebe a resposta sem esperar
    // uma escrita adicional no banco. Cumprimentos, recall puro e contexto pessoal
    // sensível são filtrados pelo serviço e não substituem o assunto substantivo.
    void saveJarvisContinuity({
      tenantId,
      userId,
      conversationId: parsed.data.conversationId ?? null,
      userMessage: text,
      assistantResponse: fullResponse,
      route: parsed.data.context?.route ?? null,
    }).catch((err) => {
      req.log?.warn({ err, tenantId, userId }, "jarvis presence: falha ao persistir continuidade");
    });

    const totalMs = Date.now() - startedAt;
    const firstTokenMs = firstTokenAt == null ? null : firstTokenAt - startedAt;
    req.log?.info({ tenantId, firstTokenMs, providerMs, totalMs }, "jarvis presence: resposta concluída");
    res.write(`data: ${JSON.stringify({
      done: true,
      jarvisMode: "presence",
      route: resolution.route,
      requiresApproval: resolution.requiresApproval,
      performance: { firstTokenMs, providerMs, totalMs },
    })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err, tenantId }, "jarvis presence: erro no streaming");
    res.write(`data: ${JSON.stringify({ error: "Não consegui concluir a resposta agora." })}\n\n`);
    res.end();
  }
});

export default router;
