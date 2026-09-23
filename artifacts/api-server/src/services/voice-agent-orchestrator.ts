import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  conversationsTable,
  dealsTable,
  messagesTable,
} from "@workspace/db";
import {
  loadContext,
  type AgentName,
} from "../lib/agent-engine.js";
import { determineAgent } from "./agent-dispatch.js";

export type VoiceLeadState = {
  leadId: string;
  specialist: AgentName;
  objective: string;
  nextBestAction: string;
  known: Record<string, unknown>;
  missing: string[];
  handoffRequired: boolean;
  handoffReason: string | null;
};

function daysSinceLastLeadContact(messages: Array<{ enviadoPor: string; createdAt: Date }>): number | null {
  const last = [...messages].reverse().find((message) => message.enviadoPor === "lead");
  if (!last) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 86_400_000));
}

function objectiveFor(agent: AgentName): { objective: string; nextBestAction: string } {
  switch (agent) {
    case "reception":
      return {
        objective: "Entender rapidamente o motivo do contato e direcionar sem pressionar.",
        nextBestAction: "Fazer uma pergunta curta de contexto e confirmar o que o lead quer resolver agora.",
      };
    case "sdr":
      return {
        objective: "Qualificar contexto, dor, urgência, autoridade e próximo passo.",
        nextBestAction: "Perguntar somente a informação de maior valor que ainda falta para qualificar.",
      };
    case "closer":
      return {
        objective: "Avançar a oportunidade removendo a principal dúvida ou objeção.",
        nextBestAction: "Tratar a objeção dominante com contexto do CRM e buscar um próximo compromisso concreto.",
      };
    case "followup":
      return {
        objective: "Retomar a conversa de forma contextual e útil.",
        nextBestAction: "Retomar pelo último ponto relevante e validar se a prioridade continua ativa.",
      };
    case "reactivation":
      return {
        objective: "Reativar interesse sem abordagem genérica.",
        nextBestAction: "Usar o histórico real para descobrir se o problema ainda existe antes de propor algo.",
      };
    case "scheduler":
      return {
        objective: "Converter intenção em compromisso de agenda.",
        nextBestAction: "Confirmar data, horário e formato da reunião com o mínimo de fricção.",
      };
    case "service":
      return {
        objective: "Resolver o atendimento e acompanhar até a conclusão.",
        nextBestAction: "Identificar causa, impacto e ação necessária; escalar quando depender de humano.",
      };
    case "financeiro":
      return {
        objective: "Resolver dúvidas financeiras com precisão e segurança.",
        nextBestAction: "Confirmar qual cobrança, condição ou documento o lead está tratando.",
      };
    case "cobranca":
      return {
        objective: "Regularizar pendência preservando o relacionamento.",
        nextBestAction: "Confirmar a pendência e oferecer o próximo passo autorizado para regularização.",
      };
    case "onboarding":
      return {
        objective: "Conduzir o cliente aos próximos passos de implantação.",
        nextBestAction: "Confirmar a próxima etapa pendente do onboarding e remover bloqueios.",
      };
    case "relacionamento":
      return {
        objective: "Fortalecer relacionamento e identificar oportunidades reais.",
        nextBestAction: "Usar o histórico para uma interação relevante, sem oferta automática.",
      };
    case "pharmacy":
      return {
        objective: "Atender com segurança dentro das regras do módulo Farmácia.",
        nextBestAction: "Entender o pedido e limitar a conversa às informações autorizadas e verificáveis.",
      };
    default:
      return {
        objective: "Entender o contexto e conduzir para o próximo passo útil.",
        nextBestAction: "Fazer uma pergunta curta que reduza a principal incerteza da conversa.",
      };
  }
}

function detectHumanHandoff(transcript: string): { required: boolean; reason: string | null } {
  const text = transcript.toLocaleLowerCase("pt-BR");
  const explicitHuman = /(falar|conversar|chamar).{0,20}(humano|pessoa|atendente|vendedor|gerente)/i.test(text);
  const complaint = /(reclamação|procon|processo|advogado|fraude|golpe)/i.test(text);
  if (explicitHuman) return { required: true, reason: "lead_requested_human" };
  if (complaint) return { required: true, reason: "sensitive_complaint" };
  return { required: false, reason: null };
}

export async function buildVoiceLeadState(input: {
  tenantId: string;
  leadId: string;
  transcript: string;
  log: Logger;
}): Promise<VoiceLeadState> {
  const ctx = await loadContext(input.tenantId, input.leadId);
  if (!ctx) throw new Error("VOICE_LEAD_NOT_FOUND_OR_AI_DISABLED");

  const deals = await db
    .select()
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, input.tenantId), eq(dealsTable.leadId, input.leadId)))
    .orderBy(desc(dealsTable.updatedAt));

  const specialist = await determineAgent(
    ctx.lead,
    ctx.ci,
    deals,
    daysSinceLastLeadContact(ctx.recentMessages),
    input.transcript,
    input.tenantId,
    input.log,
    ctx.recentMessages,
  );

  const discovery = (ctx.lead.discoveryData ?? {}) as Record<string, unknown>;
  const known: Record<string, unknown> = {
    name: ctx.lead.nome,
    source: ctx.lead.source,
    status: ctx.lead.status,
    company: discovery["empresa"] ?? discovery["company"] ?? null,
    need: discovery["necessidade"] ?? discovery["need"] ?? null,
    pain: discovery["dor"] ?? discovery["pain"] ?? null,
    urgency: discovery["urgencia"] ?? discovery["urgency"] ?? null,
    budget: discovery["orcamento"] ?? discovery["budget"] ?? null,
    authority: discovery["autoridade"] ?? discovery["authority"] ?? null,
    objection: discovery["objecao"] ?? discovery["objection"] ?? null,
  };

  const missing = Object.entries(known)
    .filter(([key, value]) => ["need", "pain", "urgency", "authority"].includes(key) && (value === null || value === undefined || value === ""))
    .map(([key]) => key);

  const goal = objectiveFor(specialist);
  const handoff = detectHumanHandoff(input.transcript);

  return {
    leadId: input.leadId,
    specialist,
    objective: goal.objective,
    nextBestAction: goal.nextBestAction,
    known,
    missing,
    handoffRequired: handoff.required,
    handoffReason: handoff.reason,
  };
}

export async function startVoiceSession(input: {
  tenantId: string;
  leadId: string;
  log: Logger;
  source?: "whatsapp" | "phone" | "web";
}) {
  const sessionId = crypto.randomUUID();
  const initialState = await buildVoiceLeadState({
    tenantId: input.tenantId,
    leadId: input.leadId,
    transcript: "",
    log: input.log,
  });

  const ctx = await loadContext(input.tenantId, input.leadId);
  let conversationId = ctx?.conversation?.id ?? null;

  const voiceMetadata = {
    voiceSession: {
      sessionId,
      status: "active",
      source: input.source ?? "whatsapp",
      startedAt: new Date().toISOString(),
      specialist: initialState.specialist,
      objective: initialState.objective,
      nextBestAction: initialState.nextBestAction,
      voiceProvider: "duble",
      bargeIn: true,
    },
  };

  if (ctx?.conversation) {
    await db.update(conversationsTable)
      .set({
        channel: input.source === "whatsapp" ? "whatsapp_call" : "voice_call",
        currentAgent: initialState.specialist,
        metadata: { ...(ctx.conversation.metadata ?? {}), ...voiceMetadata },
        updatedAt: new Date(),
      })
      .where(and(eq(conversationsTable.id, ctx.conversation.id), eq(conversationsTable.tenantId, input.tenantId)));
  } else {
    const [created] = await db.insert(conversationsTable).values({
      tenantId: input.tenantId,
      leadId: input.leadId,
      channel: input.source === "whatsapp" ? "whatsapp_call" : "voice_call",
      status: "open",
      currentAgent: initialState.specialist,
      metadata: voiceMetadata,
      ultimaMensagemEm: new Date(),
    }).returning({ id: conversationsTable.id });
    conversationId = created?.id ?? null;
  }

  return { sessionId, conversationId, state: initialState };
}

export async function registerVoiceTurn(input: {
  tenantId: string;
  leadId: string;
  sessionId: string;
  transcript: string;
  log: Logger;
}) {
  const ctx = await loadContext(input.tenantId, input.leadId);
  if (!ctx?.conversation) throw new Error("VOICE_CONVERSATION_NOT_FOUND");

  const state = await buildVoiceLeadState(input);

  await db.insert(messagesTable).values({
    tenantId: input.tenantId,
    conversationId: ctx.conversation.id,
    leadId: input.leadId,
    direcao: "entrada",
    canal: "whatsapp",
    conteudo: input.transcript,
    tipoConteudo: "audio",
    enviadoPor: "lead",
    status: "lido",
    agentName: state.specialist,
  });

  const previous = (ctx.conversation.metadata ?? {}) as Record<string, unknown>;
  await db.update(conversationsTable)
    .set({
      currentAgent: state.handoffRequired ? "humano" : state.specialist,
      ultimaMensagemEm: new Date(),
      lastInboundAt: new Date(),
      metadata: {
        ...previous,
        voiceSession: {
          ...(typeof previous["voiceSession"] === "object" && previous["voiceSession"] ? previous["voiceSession"] as Record<string, unknown> : {}),
          sessionId: input.sessionId,
          specialist: state.specialist,
          objective: state.objective,
          nextBestAction: state.nextBestAction,
          handoffRequired: state.handoffRequired,
          handoffReason: state.handoffReason,
          updatedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(and(eq(conversationsTable.id, ctx.conversation.id), eq(conversationsTable.tenantId, input.tenantId)));

  return {
    sessionId: input.sessionId,
    conversationId: ctx.conversation.id,
    state,
    speech: {
      voiceProvider: "duble",
      streaming: true,
      bargeIn: true,
      directive: [
        "Responda em fala natural, curta e contextual.",
        "Não recite scripts nem despeje informações.",
        "Faça no máximo uma pergunta por turno.",
        "Use o objetivo e a próxima melhor ação como direção, não como texto literal.",
        "Se handoffRequired=true, pare a automação comercial e encaminhe para humano.",
      ].join(" "),
    },
  };
}

export async function endVoiceSession(input: {
  tenantId: string;
  leadId: string;
  sessionId: string;
}) {
  const ctx = await loadContext(input.tenantId, input.leadId);
  if (!ctx?.conversation) throw new Error("VOICE_CONVERSATION_NOT_FOUND");

  const previous = (ctx.conversation.metadata ?? {}) as Record<string, unknown>;
  await db.update(conversationsTable)
    .set({
      metadata: {
        ...previous,
        voiceSession: {
          ...(typeof previous["voiceSession"] === "object" && previous["voiceSession"] ? previous["voiceSession"] as Record<string, unknown> : {}),
          sessionId: input.sessionId,
          status: "ended",
          endedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(and(eq(conversationsTable.id, ctx.conversation.id), eq(conversationsTable.tenantId, input.tenantId)));

  return { sessionId: input.sessionId, status: "ended" as const };
}
