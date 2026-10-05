import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  conversationsTable,
  customerIntelligenceTable,
  dealsTable,
  leadsTable,
  messagesTable,
  pipelineStagesTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { resolverContextoNegocio } from "./resolvedorContextoNegocio.js";
import { sendOutgoingMessage } from "./omnichannel.js";

export type CanalAcompanhamento =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "email"
  | "chat"
  | "ligacao";

export type PlanoAcompanhamento = {
  ativo: boolean;
  etapa: string;
  objetivo: string;
  modo: "automatico" | "gerar_aprovar" | "somente_sugestao";
  canalPrincipal: CanalAcompanhamento | null;
  canaisAlternativos: CanalAcompanhamento[];
  tipoConteudo: "texto" | "imagem" | "video" | "audio" | "documento" | "proposta" | "case";
  argumento: string;
  beneficio?: string | null;
  diferencial?: string | null;
  prova?: string | null;
  chamadaParaAcao: string;
  conteudo: string;
  motivo: string;
  requerHumano: boolean;
  agenteResponsavelKey: string | null;
  fontes: Array<{
    id: string;
    tipo: string;
    categoria: string;
    titulo: string;
    resumo: string;
  }>;
};

type ContextoLead = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  instagramScopedId: string | null;
  messengerScopedId: string | null;
  status: string | null;
};

function canalTemExecucaoExterna(canal: CanalAcompanhamento): boolean {
  return canal === "whatsapp" || canal === "instagram" || canal === "messenger";
}

function normalizarCanais(value: unknown): CanalAcompanhamento[] {
  const allowed = new Set<CanalAcompanhamento>(["whatsapp", "instagram", "messenger", "email", "chat", "ligacao"]);
  return Array.isArray(value)
    ? value.map((item) => String(item) as CanalAcompanhamento).filter((item) => allowed.has(item))
    : [];
}

async function carregarContextoBasico(tenantId: string, leadId: string, dealId?: string | null) {
  const [lead] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      telefone: leadsTable.telefone,
      email: leadsTable.email,
      instagramScopedId: leadsTable.instagramScopedId,
      messengerScopedId: leadsTable.messengerScopedId,
      status: leadsTable.status,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) throw new Error("Lead não encontrado para acompanhamento.");

  const [deal] = dealId
    ? await db
        .select()
        .from(dealsTable)
        .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)))
        .limit(1)
    : await db
        .select()
        .from(dealsTable)
        .where(and(eq(dealsTable.leadId, leadId), eq(dealsTable.tenantId, tenantId)))
        .orderBy(desc(dealsTable.updatedAt))
        .limit(1);

  const etapa = deal?.etapa ?? "novo";

  const [stage] = await db
    .select()
    .from(pipelineStagesTable)
    .where(and(
      eq(pipelineStagesTable.tenantId, tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, etapa),
    ))
    .limit(1);

  const [ci] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(and(
      eq(customerIntelligenceTable.tenantId, tenantId),
      eq(customerIntelligenceTable.leadId, leadId),
    ))
    .limit(1);

  const conversas = await db
    .select({
      channel: conversationsTable.channel,
      ultimaMensagemEm: conversationsTable.ultimaMensagemEm,
      lastInboundAt: conversationsTable.lastInboundAt,
    })
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.tenantId, tenantId),
      eq(conversationsTable.leadId, leadId),
    ))
    .orderBy(desc(conversationsTable.ultimaMensagemEm))
    .limit(20);

  const mensagens = await db
    .select({
      canal: messagesTable.canal,
      direcao: messagesTable.direcao,
      conteudo: messagesTable.conteudo,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.tenantId, tenantId),
      eq(messagesTable.leadId, leadId),
    ))
    .orderBy(desc(messagesTable.createdAt))
    .limit(20);

  return { lead: lead as ContextoLead, deal, etapa, stage, ci, conversas, mensagens };
}

function canaisDisponiveis(context: Awaited<ReturnType<typeof carregarContextoBasico>>): CanalAcompanhamento[] {
  const result: CanalAcompanhamento[] = [];
  const seen = new Set<string>();

  for (const conv of context.conversas) {
    const channel = String(conv.channel) as CanalAcompanhamento;
    if (!seen.has(channel) && ["whatsapp", "instagram", "messenger", "email", "chat"].includes(channel)) {
      seen.add(channel);
      result.push(channel);
    }
  }

  if (context.lead.telefone && !seen.has("whatsapp")) result.push("whatsapp");
  if (context.lead.instagramScopedId && !seen.has("instagram")) result.push("instagram");
  if (context.lead.messengerScopedId && !seen.has("messenger")) result.push("messenger");
  if (context.lead.email && !seen.has("email")) result.push("email");
  result.push("ligacao");

  return [...new Set(result)];
}

function objetivoPadrao(etapa: string): string {
  switch (etapa) {
    case "novo": return "Iniciar conversa, entender contexto e conseguir o próximo passo.";
    case "qualificado": return "Aprofundar necessidade e conduzir para proposta ou reunião.";
    case "proposta": return "Confirmar entendimento da proposta, reforçar valor relevante e identificar objeções.";
    case "negociacao": return "Tratar objeções com evidências e definir o próximo passo de decisão.";
    case "em_aquecimento": return "Manter relacionamento útil sem pressão e detectar novo momento de compra.";
    default: return "Conduzir o cliente ao próximo passo coerente da jornada.";
  }
}

export async function planejarAcompanhamento(params: {
  tenantId: string;
  leadId: string;
  dealId?: string | null;
  motivoDisparo?: string;
  modoPadrao?: "automatico" | "gerar_aprovar" | "somente_sugestao";
  log: Logger;
}): Promise<PlanoAcompanhamento> {
  const context = await carregarContextoBasico(params.tenantId, params.leadId, params.dealId);
  const cfg = (context.stage?.acompanhamentoConfig ?? {}) as Record<string, unknown>;
  const stageAIConfig = (context.stage?.aiConfig ?? {}) as {
    mode?: string;
    allowedActions?: string[];
  };
  const stageAgentAutonomous = Boolean(
    context.stage?.responsavelAgenteKey
    && stageAIConfig.mode === "autonoma"
    && (
      (stageAIConfig.allowedActions ?? []).includes("send_message")
      || (stageAIConfig.allowedActions ?? []).includes("create_activity")
    )
  );
  const canaisConfigurados = normalizarCanais(cfg.canaisPermitidos);
  const disponiveis = canaisDisponiveis(context);
  const candidatos = (canaisConfigurados.length ? canaisConfigurados : disponiveis).filter((channel) => disponiveis.includes(channel));
  const objetivo = typeof cfg.objetivo === "string" && cfg.objetivo.trim()
    ? cfg.objetivo.trim()
    : objetivoPadrao(context.etapa);
  const modo = ["automatico", "gerar_aprovar", "somente_sugestao"].includes(String(cfg.modo))
    ? String(cfg.modo) as PlanoAcompanhamento["modo"]
    : stageAgentAutonomous
      ? "automatico"
      : (params.modoPadrao ?? "gerar_aprovar");

  const contextoNegocio = await resolverContextoNegocio({
    tenantId: params.tenantId,
    query: [
      context.lead.nome,
      context.etapa,
      objetivo,
      context.ci?.intentAnalysis,
      context.ci?.goalAnalysis,
      context.ci?.nextBestAction,
      context.ci?.nextBestActionMotivo,
      ...context.mensagens.slice(0, 8).map((message) => message.conteudo),
    ].filter(Boolean).join(" | "),
    limit: 12,
  });

  const result = await callOpenAI(
    params.tenantId,
    "agent_followup",
    [
      {
        role: "system",
        content:
          "Você decide o próximo acompanhamento comercial de um cliente. " +
          "Use somente fatos do CRM e da Inteligência do Negócio fornecida. " +
          "Não invente benefício, diferencial, prova, preço, prazo, garantia ou comparação. " +
          "Não repita abordagens recentes. Escolha um único objetivo e uma única chamada para ação. " +
          "Se a negociação envolver desconto, condição excepcional, promessa ou risco comercial, marque requerHumano=true. " +
          "Retorne somente JSON válido.",
      },
      {
        role: "user",
        content: JSON.stringify({
          motivoDisparo: params.motivoDisparo ?? "acompanhamento da jornada",
          lead: context.lead,
          etapa: context.etapa,
          objetivo,
          modo,
          customerIntelligence: context.ci,
          deal: context.deal ? {
            id: context.deal.id,
            titulo: context.deal.titulo,
            etapa: context.deal.etapa,
            valor: context.deal.valor,
            dataFechamentoPrevista: context.deal.dataFechamentoPrevista,
          } : null,
          canaisDisponiveis: disponiveis,
          canaisCandidatos: candidatos,
          historicoRecente: context.mensagens.slice(0, 12).reverse(),
          inteligenciaNegocio: contextoNegocio.blocoPrompt,
          configuracaoEtapa: cfg,
          formato: {
            canalPrincipal: "whatsapp|instagram|messenger|email|chat|ligacao|null",
            canaisAlternativos: ["..."],
            tipoConteudo: "texto|imagem|video|audio|documento|proposta|case",
            argumento: "qual é a ideia central desta abordagem",
            beneficio: "benefício usado ou null",
            diferencial: "diferencial usado ou null",
            prova: "prova/case/documento usado ou null",
            chamadaParaAcao: "um próximo passo",
            conteudo: "mensagem pronta para o canal principal",
            motivo: "por que esta ação faz sentido agora",
            requerHumano: false
          }
        }).slice(0, 65000),
      },
    ],
    {
      temperature: 0.2,
      maxTokens: 1800,
      responseFormat: { type: "json_object" },
      log: params.log,
    },
  );

  const raw = JSON.parse(result.content || "{}") as Record<string, unknown>;
  const suggested = String(raw.canalPrincipal ?? "") as CanalAcompanhamento;
  const canalPrincipal = candidatos.includes(suggested) ? suggested : (candidatos[0] ?? null);
  const alternatives = normalizarCanais(raw.canaisAlternativos)
    .filter((channel) => channel !== canalPrincipal && disponiveis.includes(channel));

  return {
    ativo: cfg.ativo === true || stageAgentAutonomous,
    etapa: context.etapa,
    objetivo,
    modo,
    canalPrincipal,
    canaisAlternativos: alternatives,
    tipoConteudo: ["texto", "imagem", "video", "audio", "documento", "proposta", "case"].includes(String(raw.tipoConteudo))
      ? String(raw.tipoConteudo) as PlanoAcompanhamento["tipoConteudo"]
      : "texto",
    argumento: String(raw.argumento ?? "").trim(),
    beneficio: raw.beneficio == null ? null : String(raw.beneficio).trim(),
    diferencial: raw.diferencial == null ? null : String(raw.diferencial).trim(),
    prova: raw.prova == null ? null : String(raw.prova).trim(),
    chamadaParaAcao: String(raw.chamadaParaAcao ?? "").trim(),
    conteudo: String(raw.conteudo ?? "").trim(),
    motivo: String(raw.motivo ?? "").trim(),
    requerHumano: Boolean(raw.requerHumano),
    agenteResponsavelKey: context.stage?.responsavelAgenteKey ?? null,
    fontes: contextoNegocio.fontes.map((fonte) => ({
      id: fonte.id,
      tipo: fonte.tipo,
      categoria: fonte.categoria,
      titulo: fonte.titulo,
      resumo: fonte.resumo,
    })),
  };
}

export async function executarAcompanhamento(params: {
  tenantId: string;
  leadId: string;
  dealId?: string | null;
  motivoDisparo?: string;
  modoPadrao?: "automatico" | "gerar_aprovar" | "somente_sugestao";
  log: Logger;
}) {
  const plano = await planejarAcompanhamento(params);

  if (
    !plano.ativo ||
    plano.modo !== "automatico" ||
    plano.requerHumano ||
    !plano.canalPrincipal ||
    !canalTemExecucaoExterna(plano.canalPrincipal) ||
    !plano.conteudo
  ) {
    return { executado: false, plano };
  }

  const result = await sendOutgoingMessage({
    tenantId: params.tenantId,
    leadId: params.leadId,
    conteudo: plano.conteudo,
    canal: plano.canalPrincipal,
    agentName: plano.agenteResponsavelKey ?? "followup",
  }, params.log);

  return { executado: true, plano, mensagemId: result.message.id };
}
