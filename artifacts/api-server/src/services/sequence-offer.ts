/**
 * Revenue Scout — oferta de "próximo produto da sequência" (ex: cimento → tubos).
 *
 * Fluxo:
 *  1. revenueScout.ts detecta que o cliente comprou produtoOrigemId há >= diasApos
 *     dias (regra tipo "sequencia_produto") e cria uma scout_oportunidade.
 *  2. processarOportunidades() chama triggerSequenceOffer() para essa oportunidade:
 *     envia a oferta via agente Pós-Venda (relacionamento) e marca
 *     lead.pendingSequenceOportunidadeId.
 *  3. Próxima mensagem do lead ⇒ handleSequenceOfferReply() classifica (IA):
 *       - "confirma_interesse" (confiante) OU baixa confiança: marca oportunidade
 *         "respondeu", limpa o pending e NÃO intercepta — deixa a mensagem seguir o
 *         fluxo normal de dispatch (auto-quote/closer decide o próximo passo).
 *       - "ainda_nao" (confiante): pergunta em que etapa do projeto o cliente está,
 *         status → "aguardando_etapa", intercepta (handled=true).
 *  4. Se aguardando_etapa, a próxima mensagem é o texto livre da etapa: grava em
 *     cliente_etapa_projeto, estima quantos dias até reconsiderar a oferta (IA leve)
 *     e marca a oportunidade "adiado" com proximaTentativaEm — o Revenue Scout só
 *     volta a considerar essa oferta depois desse instante (nunca por calendário fixo).
 */
import { eq, and } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  agentConfigsTable,
  activitiesTable,
  scoutOportunidadesTable,
  scoutRegrasTable,
  clienteEtapaProjetoTable,
  produtosCatalogoTable,
  leadsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { computeLimits, updateCounters, insertAndRun } from "../lib/agent-engine.js";

interface SequenceCondicoes {
  produtoOrigemId?: string;
  produtoSugeridoId?: string;
  diasApos?: number;
}

function parseCondicoes(raw: unknown): SequenceCondicoes {
  return (raw ?? {}) as SequenceCondicoes;
}

/** Envia uma mensagem do agente Pós-Venda respeitando enabled/limits do tenant. */
async function sendSequenceMessage(
  tenantId: string,
  leadId: string,
  resposta: string,
  extraPayload: Record<string, unknown> | undefined,
  log: Logger,
): Promise<boolean> {
  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) return false;

  const agentCfg = config.agents?.relacionamento;
  if (!agentCfg?.enabled) return false;

  const limits = computeLimits(config);
  if (!limits.ok) return false;

  const now = new Date();
  await updateCounters(config, limits, 0, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  await insertAndRun({
    tenantId,
    leadId,
    agentName: "relacionamento",
    actionType: "enviar_whatsapp",
    resposta,
    extraPayload,
    isAutonomous,
    now,
    log,
  });

  return true;
}

/**
 * Dispara a oferta do próximo produto da sequência para uma oportunidade
 * tipo "sequencia_produto". Chamado por processarOportunidades().
 */
export async function triggerSequenceOffer(params: {
  tenantId: string;
  oportunidadeId: string;
  leadId: string;
  regraId: string;
  log: Logger;
}): Promise<boolean> {
  const { tenantId, oportunidadeId, leadId, regraId, log } = params;

  const [regra] = await db.select().from(scoutRegrasTable).where(eq(scoutRegrasTable.id, regraId));
  const cond = parseCondicoes(regra?.condicoes);

  if (!cond.produtoSugeridoId) {
    log.warn({ tenantId, oportunidadeId, regraId }, "sequence-offer: regra sem produtoSugeridoId, ignorando");
    await db.update(scoutOportunidadesTable).set({ status: "ignorado" }).where(eq(scoutOportunidadesTable.id, oportunidadeId));
    return false;
  }

  const [produto] = await db
    .select({ nome: produtosCatalogoTable.nome })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, cond.produtoSugeridoId));

  const nomeProduto = produto?.nome ?? "esse próximo item";

  const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable).where(eq(leadsTable.id, leadId));

  const mensagem =
    `Oi ${lead?.nome ?? ""}! Passando aqui pra saber: já está na hora de pensar em ${nomeProduto} para dar sequência ao seu projeto? ` +
    `Se fizer sentido agora, me avisa que já preparo uma proposta 🙂`;

  const sent = await sendSequenceMessage(
    tenantId,
    leadId,
    mensagem,
    { origin: "scout_sequencia_produto", oportunidadeId },
    log,
  );

  if (!sent) {
    log.info({ tenantId, oportunidadeId }, "sequence-offer: mensagem não enviada (agente indisponível)");
    return false;
  }

  await db
    .update(scoutOportunidadesTable)
    .set({ status: "enviado", mensagemEnviada: mensagem, canal: "whatsapp", enviadoEm: new Date() })
    .where(eq(scoutOportunidadesTable.id, oportunidadeId));

  await db
    .update(leadsTable)
    .set({ pendingSequenceOportunidadeId: oportunidadeId, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));

  log.info({ tenantId, oportunidadeId, leadId }, "sequence-offer: oferta enviada");
  return true;
}

interface SequenceReplyClassification {
  intent: "confirma_interesse" | "ainda_nao";
  confident: boolean;
  confidence: number;
}

async function classifySequenceReply(
  mensagem: string,
  tenantId: string,
  log: Logger,
): Promise<SequenceReplyClassification> {
  const prompt =
    `Você é um classificador de intenção sobre uma oferta de "próximo produto" enviada a um cliente ` +
    `(ex: ofereceu tubos depois de uma compra de cimento, sugerindo dar sequência a um projeto).\n\n` +
    `Classifique a resposta do cliente como:\n` +
    `- "confirma_interesse": o cliente demonstra interesse, quer saber mais, pede orçamento, ou concorda em prosseguir.\n` +
    `- "ainda_nao": o cliente diz que ainda não chegou nessa etapa do projeto, não é o momento, ou pede para aguardar.\n\n` +
    `Regras:\n` +
    `- Só retorne confident: true se tiver ALTA confiança (confidence >= 0.6)\n` +
    `- Se a resposta for ambígua, vaga ou não relacionada, retorne confident: false\n\n` +
    `Resposta do cliente:\n"${mensagem}"\n\n` +
    `Responda APENAS em JSON válido (sem markdown):\n` +
    `{"intent": "confirma_interesse"|"ainda_nao", "confident": true|false, "confidence": 0.0}`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 60, temperature: 0, log },
    );

    const raw = result.content.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { intent?: string; confident?: boolean; confidence?: number };

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const intent: "confirma_interesse" | "ainda_nao" = parsed.intent === "ainda_nao" ? "ainda_nao" : "confirma_interesse";
    const confident = parsed.confident === true && confidence >= 0.6;

    return { intent, confident, confidence };
  } catch (err) {
    log.warn({ err, tenantId }, "sequence-offer: classification failed — treating as low confidence");
    return { intent: "confirma_interesse", confident: false, confidence: 0 };
  }
}

/** Estima, a partir da etapa relatada, em quantos dias vale a pena reconsiderar a oferta. */
async function estimarDiasParaProximaTentativa(
  etapaAtual: string,
  tenantId: string,
  log: Logger,
): Promise<number> {
  const prompt =
    `Um cliente de obra/projeto relatou em que etapa está: "${etapaAtual}".\n` +
    `Estime quantos dias, a partir de hoje, seria razoável esperar antes de perguntar novamente se ` +
    `ele já avançou para a próxima etapa (e assim oferecer o próximo produto necessário). ` +
    `Se a etapa parecer demorada (ex: fundação, alvenaria), estime mais dias (ex: 20-40). ` +
    `Se parecer rápida ou já próxima da próxima etapa, estime menos dias (ex: 5-10). ` +
    `Se não conseguir estimar, responda 14.\n\n` +
    `Responda APENAS em JSON válido (sem markdown): {"dias": 14}`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 30, temperature: 0, log },
    );
    const raw = result.content.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { dias?: number };
    const dias = typeof parsed.dias === "number" && parsed.dias > 0 ? Math.round(parsed.dias) : 14;
    return Math.min(dias, 120);
  } catch (err) {
    log.warn({ err, tenantId }, "sequence-offer: estimativa de dias falhou — usando padrão de 14 dias");
    return 14;
  }
}

/**
 * Trata a resposta do lead a uma oferta de sequência pendente.
 * Retorna handled=true se a mensagem foi totalmente tratada aqui (dispatch deve
 * parar). Retorna handled=false se o dispatch normal deve continuar processando
 * a mensagem (ex: cliente confirmou interesse — closer/auto-quote assume).
 */
export async function handleSequenceOfferReply(params: {
  tenantId: string;
  leadId: string;
  oportunidadeId: string;
  mensagem: string;
  log: Logger;
}): Promise<{ handled: boolean }> {
  const { tenantId, leadId, oportunidadeId, mensagem, log } = params;

  const clearPending = () =>
    db
      .update(leadsTable)
      .set({ pendingSequenceOportunidadeId: null, updatedAt: new Date() })
      .where(eq(leadsTable.id, leadId));

  const [op] = await db
    .select()
    .from(scoutOportunidadesTable)
    .where(and(eq(scoutOportunidadesTable.id, oportunidadeId), eq(scoutOportunidadesTable.tenantId, tenantId)));

  if (!op) {
    log.warn({ tenantId, leadId, oportunidadeId }, "sequence-offer: oportunidade não encontrada, limpando pending");
    await clearPending();
    return { handled: false };
  }

  if (op.status === "aguardando_etapa") {
    // Esta mensagem é a etapa relatada pelo cliente (texto livre).
    const etapaAtual = mensagem.trim().slice(0, 500);

    await db
      .insert(clienteEtapaProjetoTable)
      .values({ tenantId, leadId, etapaAtual, atualizadoEm: new Date() })
      .onConflictDoUpdate({
        target: [clienteEtapaProjetoTable.tenantId, clienteEtapaProjetoTable.leadId],
        set: { etapaAtual, atualizadoEm: new Date() },
      });

    const dias = await estimarDiasParaProximaTentativa(etapaAtual, tenantId, log);
    const proximaTentativaEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    await db
      .update(scoutOportunidadesTable)
      .set({ status: "adiado", etapaRelatada: etapaAtual, proximaTentativaEm })
      .where(eq(scoutOportunidadesTable.id, oportunidadeId));

    await clearPending();

    await sendSequenceMessage(
      tenantId,
      leadId,
      "Entendido, obrigado por avisar! Fico de olho e volto a falar com você mais pra frente, quando fizer mais sentido 👍",
      { origin: "scout_sequencia_produto_etapa", oportunidadeId },
      log,
    );

    await db.insert(activitiesTable).values({
      tenantId,
      leadId,
      tipo: "scout_sequencia_etapa" as "tarefa",
      titulo: "Cliente relatou etapa do projeto",
      descricao: etapaAtual,
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: `oportunidadeId:${oportunidadeId}|proximaTentativaEm:${proximaTentativaEm.toISOString()}`,
    }).catch((err: unknown) => {
      log.warn({ err, tenantId, leadId, oportunidadeId }, "sequence-offer: falha ao registrar activity de etapa");
    });

    log.info({ tenantId, leadId, oportunidadeId, etapaAtual, dias }, "sequence-offer: etapa registrada, oferta adiada");
    return { handled: true };
  }

  if (op.status !== "enviado") {
    // Estado obsoleto — limpa e deixa o fluxo normal seguir.
    await clearPending();
    return { handled: false };
  }

  const classification = await classifySequenceReply(mensagem, tenantId, log);

  if (classification.intent === "ainda_nao" && classification.confident) {
    await db
      .update(scoutOportunidadesTable)
      .set({ status: "aguardando_etapa" })
      .where(eq(scoutOportunidadesTable.id, oportunidadeId));

    await sendSequenceMessage(
      tenantId,
      leadId,
      "Sem problemas! Em que etapa você está agora no projeto?",
      { origin: "scout_sequencia_produto_pergunta_etapa", oportunidadeId },
      log,
    );

    log.info({ tenantId, leadId, oportunidadeId }, "sequence-offer: cliente ainda não chegou na etapa, perguntando etapa atual");
    return { handled: true };
  }

  // Confirma interesse (confiante) ou baixa confiança: marca como respondida e
  // deixa o fluxo normal de dispatch (auto-quote/closer) processar a mensagem.
  await db
    .update(scoutOportunidadesTable)
    .set({ status: "respondeu", respondeu: true })
    .where(eq(scoutOportunidadesTable.id, oportunidadeId));

  await clearPending();

  log.info(
    { tenantId, leadId, oportunidadeId, confidence: classification.confidence },
    "sequence-offer: resposta tratada como interesse — seguindo fluxo normal",
  );
  return { handled: false };
}
