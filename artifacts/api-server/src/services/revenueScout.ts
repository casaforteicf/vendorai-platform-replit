/**
 * Revenue Scout — engine de oportunidades de receita.
 *
 * analisarCliente: avalia regras ativas do tenant para um cliente específico
 *                  e insere scout_oportunidades quando uma regra se aplica.
 *
 * processarOportunidades: pega oportunidades pendentes e envia via WhatsApp.
 *
 * runRevenueScoutJob: orquestrador diário chamado pelo scheduler.
 */
import { and, eq, desc, gte, ne, isNotNull, or, lte, isNull } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  leadsTable,
  scoutRegrasTable,
  scoutOportunidadesTable,
  clientServiceGapsTable,
  beautyAgendamentosTable,
  beautyServicosTable,
  clinicConsultasTable,
  clinicEspecialidadesTable,
  agentConfigsTable,
  propostasTable,
  produtosCatalogoTable,
  intentSignalsTable,
  type PropostaItem,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { triggerSequenceOffer } from "./sequence-offer.js";

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface Condicoes {
  diasSemCompra?: number;
  diasSemVisita?: number;
  servicoId?: string;
  servicoSugeridoId?: string;
  servicoAtualId?: string;
  servicoPremiumId?: string;
  produtoOrigemId?: string;
  produtoSugeridoId?: string;
  diasApos?: number;
}

/**
 * Retorna a data da compra mais recente (proposta aceita) de um produto
 * específico por um lead, ou null se nunca comprou. Fonte genérica cross-vertical:
 * propostas.itens[].produtoId (preenchido em /propostas/from-catalogo).
 */
async function dataUltimaCompraProduto(
  tenantId: string,
  leadId: string,
  produtoId: string,
): Promise<Date | null> {
  const propostas = await db
    .select({
      itens:      propostasTable.itens,
      acceptedAt: propostasTable.acceptedAt,
      updatedAt:  propostasTable.updatedAt,
    })
    .from(propostasTable)
    .where(
      and(
        eq(propostasTable.tenantId, tenantId),
        eq(propostasTable.leadId, leadId),
        eq(propostasTable.status, "aceita"),
      ),
    );

  let melhorData: Date | null = null;
  for (const p of propostas) {
    const itens = (p.itens ?? []) as PropostaItem[];
    if (!itens.some((i) => i.produtoId === produtoId)) continue;
    const data = p.acceptedAt ?? p.updatedAt;
    if (!melhorData || data > melhorData) melhorData = data;
  }
  return melhorData;
}

interface Acao {
  mensagem?: string;
  canal?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCond(raw: unknown): Condicoes {
  return (raw ?? {}) as Condicoes;
}

function parseAcao(raw: unknown): Acao {
  return (raw ?? {}) as Acao;
}

/**
 * Calcula scoreOportunidade (0-100) com base no tipo de regra e no atraso
 * em relação ao padrão esperado. Usado para priorizar processamento.
 *
 * Bases por tipo (quanto mais urgente/valioso, maior o base):
 *   sequencia_produto = 80  (compra confirmada + oferta de follow-up)
 *   upgrade           = 75  (cliente no produto base, alvo premium)
 *   cross_sell        = 65  (histórico indica fit com produto complementar)
 *   aniversario       = 60  (janela de 1 dia — alta urgência temporal)
 *   recompra          = 55  (clientes com histórico, potencial de recorrência)
 *   reativacao        = 45  (leads frios — menos urgente)
 *
 * Bônus de atraso (+10): quando dias passados excedem 1.5× o limiar esperado.
 */
function calcularScoreOportunidade(
  tipo: string | null | undefined,
  diasDesdeUltimo: number,
  diasEsperado: number,
): number {
  const bases: Record<string, number> = {
    sequencia_produto: 80,
    upgrade:           75,
    cross_sell:        65,
    aniversario:       60,
    recompra:          55,
    reativacao:        45,
  };
  const base = bases[tipo ?? ""] ?? 50;
  const bonus = diasEsperado > 0 && diasDesdeUltimo > diasEsperado * 1.5 ? 10 : 0;
  return Math.min(base + bonus, 100);
}

/** Retorna true se o mês e dia do dataNascimento coincidem com hoje. */
function isAniversarioHoje(dataNascimento: string | null): boolean {
  if (!dataNascimento) return false;
  const today = new Date();
  // Suporta YYYY-MM-DD ou DD/MM/YYYY
  let month: number, day: number;
  if (dataNascimento.includes("-")) {
    const parts = dataNascimento.split("-");
    month = parseInt(parts[1] ?? "0", 10);
    day   = parseInt(parts[2] ?? "0", 10);
  } else {
    const parts = dataNascimento.split("/");
    day   = parseInt(parts[0] ?? "0", 10);
    month = parseInt(parts[1] ?? "0", 10);
  }
  return month === today.getMonth() + 1 && day === today.getDate();
}

// ── Intent score helper ────────────────────────────────────────────────────────

/**
 * Retorna o intent score atual do lead baseado nos sinais dos últimos 30 dias.
 * Reutilizado tanto na análise de clientes quanto na reavaliação sob demanda.
 */
async function getLeadIntentScore(tenantId: string, leadId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const weights: Record<string, number> = {
    google_search:    30,
    meta_click:       25,
    site_visit:       20,
    whatsapp_question:40,
  };

  const signals = await db
    .select({ signalType: intentSignalsTable.signalType, value: intentSignalsTable.value })
    .from(intentSignalsTable)
    .where(
      and(
        eq(intentSignalsTable.leadId, leadId),
        eq(intentSignalsTable.tenantId, tenantId),
        gte(intentSignalsTable.capturedAt, cutoff),
      ),
    );

  if (signals.length === 0) return 0;
  let total = 0;
  for (const s of signals) {
    total += (weights[s.signalType] ?? 10) * ((s.value ?? 50) / 100);
  }
  return Math.min(Math.round(total), 100);
}

// ─── analisarCliente ──────────────────────────────────────────────────────────

export async function analisarCliente(
  tenantId: string,
  clienteId: string,
  log: Logger,
): Promise<void> {
  // 1. Dados do cliente (lead) — inclui intentScore e constructionStage
  const [lead] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      telefone: leadsTable.telefone,
      dataNascimento: leadsTable.dataNascimento,
      intentScore: leadsTable.intentScore,
      constructionStage: leadsTable.constructionStage,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, clienteId), eq(leadsTable.tenantId, tenantId)));

  if (!lead) return;

  // 2. Histórico de atendimentos — beauty + clinic (últimos 365 dias)
  const cutoff365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [beautyAgs, clinicCons] = await Promise.all([
    db.select({
      dataHora:  beautyAgendamentosTable.dataHora,
      servicoId: beautyAgendamentosTable.servicoId,
      status:    beautyAgendamentosTable.status,
    })
      .from(beautyAgendamentosTable)
      .where(
        and(
          eq(beautyAgendamentosTable.tenantId, tenantId),
          eq(beautyAgendamentosTable.clienteId, clienteId),
          gte(beautyAgendamentosTable.dataHora, cutoff365),
          ne(beautyAgendamentosTable.status, "cancelado"),
        ),
      )
      .orderBy(desc(beautyAgendamentosTable.dataHora)),

    db.select({
      dataHora:        clinicConsultasTable.dataHora,
      especialidadeId: clinicConsultasTable.especialidadeId,
      status:          clinicConsultasTable.status,
    })
      .from(clinicConsultasTable)
      .where(
        and(
          eq(clinicConsultasTable.tenantId, tenantId),
          eq(clinicConsultasTable.pacienteId, clienteId),
          gte(clinicConsultasTable.dataHora, cutoff365),
          ne(clinicConsultasTable.status, "cancelada"),
        ),
      )
      .orderBy(desc(clinicConsultasTable.dataHora)),
  ]);

  // 3. Cálculos
  const allDates  = [
    ...beautyAgs.map((a) => a.dataHora),
    ...clinicCons.map((c) => c.dataHora),
  ].sort((a, b) => b.getTime() - a.getTime());

  const ultimoAtendimento = allDates[0] ?? null;
  const totalAtendimentos = allDates.length;

  const diasDesdeUltimo = ultimoAtendimento
    ? Math.floor((Date.now() - ultimoAtendimento.getTime()) / (1000 * 60 * 60 * 24))
    : 9999;

  // Frequência média em dias entre visitas
  let frequenciaMedia = 0;
  if (allDates.length >= 2) {
    const diffs = allDates.slice(0, -1).map((d, i) =>
      (d.getTime() - allDates[i + 1]!.getTime()) / (1000 * 60 * 60 * 24),
    );
    frequenciaMedia = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  }

  // Set de servicoIds usados (beauty)
  const servicosUsados = new Set(beautyAgs.map((a) => a.servicoId));
  const especialidadesUsadas = new Set(clinicCons.map((c) => c.especialidadeId).filter(Boolean) as string[]);

  // 4. Regras ativas
  const regras = await db
    .select()
    .from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.ativo, true)));

  for (const regra of regras) {
    const cond = parseCond(regra.condicoes);

    // "sequencia_produto" tem elegibilidade (async, baseada em compra) e dedup
    // próprios — não usa o fluxo genérico de "pendente" abaixo, pois precisa
    // respeitar proximaTentativaEm quando a oferta foi adiada por etapa relatada.
    if (regra.tipo === "sequencia_produto") {
      if (!cond.produtoOrigemId || !cond.produtoSugeridoId) continue;

      const dataCompra = await dataUltimaCompraProduto(tenantId, clienteId, cond.produtoOrigemId);
      if (!dataCompra) continue;

      const diasDesdeCompra = Math.floor((Date.now() - dataCompra.getTime()) / (1000 * 60 * 60 * 24));
      if (diasDesdeCompra < (cond.diasApos ?? 30)) continue;

      const now = new Date();
      const [existente] = await db
        .select({ id: scoutOportunidadesTable.id, status: scoutOportunidadesTable.status, proximaTentativaEm: scoutOportunidadesTable.proximaTentativaEm })
        .from(scoutOportunidadesTable)
        .where(
          and(
            eq(scoutOportunidadesTable.tenantId, tenantId),
            eq(scoutOportunidadesTable.clienteId, clienteId),
            eq(scoutOportunidadesTable.regraId, regra.id),
          ),
        )
        .orderBy(desc(scoutOportunidadesTable.createdAt))
        .limit(1);

      if (existente) {
        const aindaEmAndamento =
          existente.status === "pendente" ||
          existente.status === "enviado" ||
          existente.status === "aguardando_etapa";
        const aindaAdiado =
          existente.status === "adiado" &&
          (!existente.proximaTentativaEm || existente.proximaTentativaEm > now);
        if (aindaEmAndamento || aindaAdiado) continue;
        // "adiado" com proximaTentativaEm vencida (ou já respondeu antes sem
        // converter) — permite reabrir uma nova oferta.
      }

      // Busca preço do produto sugerido para preencher valorEstimado
      const [produtoSugerido] = await db
        .select({ precoBase: produtosCatalogoTable.precoBase, nome: produtosCatalogoTable.nome })
        .from(produtosCatalogoTable)
        .where(eq(produtosCatalogoTable.id, cond.produtoSugeridoId))
        .limit(1);

      const diasApos = cond.diasApos ?? 30;
      const baseScoreSeq = calcularScoreOportunidade("sequencia_produto", diasDesdeCompra, diasApos);
      // Aplica boost de intenção: cada 10 pts de intentScore soma até +5 pts (cap 15)
      const intentBoostSeq = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
      const scoreSeq = Math.min(baseScoreSeq + intentBoostSeq, 100);

      await db.insert(scoutOportunidadesTable).values({
        tenantId,
        clienteId,
        regraId:          regra.id,
        tipo:             regra.tipo,
        descricao:        `Sequência de produto: sugerir ${produtoSugerido?.nome ?? cond.produtoSugeridoId} para ${lead.nome ?? clienteId}`,
        status:           "pendente",
        valorEstimado:    produtoSugerido ? String(produtoSugerido.precoBase) : undefined,
        scoreOportunidade: String(scoreSeq),
      } as any);

      await db
        .update(scoutRegrasTable)
        .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
        .where(eq(scoutRegrasTable.id, regra.id));

      log.info({ tenantId, clienteId, regraId: regra.id, tipo: regra.tipo, score: scoreSeq }, "scout: oportunidade sequencia_produto inserida");
      continue;
    }

    let seAplica = false;

    switch (regra.tipo) {
      case "recompra":
        seAplica = totalAtendimentos > 0 && diasDesdeUltimo > (cond.diasSemCompra ?? 30);
        break;

      case "reativacao":
        seAplica = diasDesdeUltimo > (cond.diasSemVisita ?? 60);
        break;

      case "cross_sell":
        // Cliente fez o serviço base mas NÃO o sugerido
        seAplica =
          !!cond.servicoId &&
          !!cond.servicoSugeridoId &&
          servicosUsados.has(cond.servicoId) &&
          !servicosUsados.has(cond.servicoSugeridoId);
        break;

      case "upgrade":
        // Cliente usa serviço atual mas NÃO o premium
        seAplica =
          !!cond.servicoAtualId &&
          !!cond.servicoPremiumId &&
          (servicosUsados.has(cond.servicoAtualId) || especialidadesUsadas.has(cond.servicoAtualId)) &&
          !servicosUsados.has(cond.servicoPremiumId) &&
          !especialidadesUsadas.has(cond.servicoPremiumId);
        break;

      case "aniversario":
        seAplica = isAniversarioHoje(lead.dataNascimento);
        break;
    }

    if (!seAplica) continue;

    // Dedup: não inserir se já existe pendente para este cliente + regra
    const [pendente] = await db
      .select({ id: scoutOportunidadesTable.id })
      .from(scoutOportunidadesTable)
      .where(
        and(
          eq(scoutOportunidadesTable.tenantId, tenantId),
          eq(scoutOportunidadesTable.clienteId, clienteId),
          eq(scoutOportunidadesTable.regraId, regra.id),
          eq(scoutOportunidadesTable.status, "pendente"),
        ),
      )
      .limit(1);

    if (pendente) continue;

    // Score: usa diasDesdeUltimo e o limiar configurado na regra + boost de intenção
    const diasEsperado =
      regra.tipo === "recompra"   ? (parseCond(regra.condicoes).diasSemCompra ?? 30) :
      regra.tipo === "reativacao" ? (parseCond(regra.condicoes).diasSemVisita ?? 60) : 0;
    const baseScore    = calcularScoreOportunidade(regra.tipo, diasDesdeUltimo, diasEsperado);
    const intentBoost  = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
    const score        = Math.min(baseScore + intentBoost, 100);

    await db.insert(scoutOportunidadesTable).values({
      tenantId,
      clienteId,
      regraId:           regra.id,
      tipo:              regra.tipo,
      descricao:         `Regra "${regra.nome}" disparada para ${lead.nome ?? clienteId}`,
      status:            "pendente",
      scoreOportunidade: String(score),
    } as any);

    // Incrementa contador de disparos da regra
    await db
      .update(scoutRegrasTable)
      .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
      .where(eq(scoutRegrasTable.id, regra.id));

    log.info({ tenantId, clienteId, regraId: regra.id, tipo: regra.tipo, score }, "scout: oportunidade inserida");
  }

  // 5. Atualizar client_service_gaps — um registro por serviço beauty usado
  for (const ag of beautyAgs) {
    if (!ag.servicoId) continue;

    // Busca nome do serviço
    const [svc] = await db
      .select({ nome: beautyServicosTable.nome })
      .from(beautyServicosTable)
      .where(eq(beautyServicosTable.id, ag.servicoId));

    const nomeServico = svc?.nome ?? ag.servicoId;
    const proximaEstimada = frequenciaMedia > 0
      ? new Date(Date.now() + frequenciaMedia * 24 * 60 * 60 * 1000)
      : null;

    const diasAtraso = proximaEstimada
      ? Math.max(0, Math.floor((Date.now() - proximaEstimada.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const [gapExisting] = await db
      .select({ id: clientServiceGapsTable.id })
      .from(clientServiceGapsTable)
      .where(
        and(
          eq(clientServiceGapsTable.tenantId, tenantId),
          eq(clientServiceGapsTable.clienteId, clienteId),
          eq(clientServiceGapsTable.servicoOuProduto, nomeServico),
        ),
      )
      .limit(1);

    if (gapExisting) {
      await db
        .update(clientServiceGapsTable)
        .set({
          ultimaCompra:            ag.dataHora.toISOString().split("T")[0] ?? null,
          proximaRecompraEstimada: proximaEstimada?.toISOString().split("T")[0] ?? null,
          diasAtraso,
          updatedAt: new Date(),
        } as any)
        .where(eq(clientServiceGapsTable.id, gapExisting.id));
    } else {
      await db.insert(clientServiceGapsTable).values({
        tenantId,
        clienteId,
        servicoOuProduto:        nomeServico,
        ultimaCompra:            ag.dataHora.toISOString().split("T")[0] ?? null,
        proximaRecompraEstimada: proximaEstimada?.toISOString().split("T")[0] ?? null,
        diasAtraso,
      } as any);
    }

    // só processa a mais recente por serviço (vetor já está desc)
    break;
  }
}

// ─── processarOportunidades ───────────────────────────────────────────────────

export async function processarOportunidades(
  tenantId: string,
  log: Logger,
): Promise<void> {
  const oportunidades = await db
    .select()
    .from(scoutOportunidadesTable)
    .where(
      and(
        eq(scoutOportunidadesTable.tenantId, tenantId),
        eq(scoutOportunidadesTable.status, "pendente"),
      ),
    )
    .orderBy(desc(scoutOportunidadesTable.scoreOportunidade))
    .limit(50);

  if (oportunidades.length === 0) return;

  log.info({ tenantId, count: oportunidades.length }, "scout/processar: oportunidades pendentes");

  for (const op of oportunidades) {
    try {
      if (op.tipo === "sequencia_produto") {
        await triggerSequenceOffer({
          tenantId,
          oportunidadeId: op.id,
          leadId: op.clienteId,
          regraId: op.regraId,
          log,
        });
        continue;
      }

      // Busca lead e regra
      const [lead] = await db
        .select({ nome: leadsTable.nome, telefone: leadsTable.telefone })
        .from(leadsTable)
        .where(eq(leadsTable.id, op.clienteId));

      if (!lead?.telefone) {
        // Sem telefone — marca como ignorado
        await db
          .update(scoutOportunidadesTable)
          .set({ status: "ignorado" })
          .where(eq(scoutOportunidadesTable.id, op.id));
        continue;
      }

      const [regra] = await db
        .select({ acao: scoutRegrasTable.acao })
        .from(scoutRegrasTable)
        .where(eq(scoutRegrasTable.id, op.regraId));

      const acao = parseAcao(regra?.acao);
      const canal = acao.canal ?? "whatsapp";

      // Personaliza mensagem
      const mensagem = (acao.mensagem ?? "Olá {nome}, temos uma novidade para você!")
        .replace("{nome}", lead.nome ?? "")
        .replace("{nome_cliente}", lead.nome ?? "");

      if (canal === "whatsapp") {
        await sendDirectWhatsAppMessage(tenantId, lead.telefone, mensagem, log);
      }
      // Outros canais podem ser adicionados aqui (email, instagram)

      await db
        .update(scoutOportunidadesTable)
        .set({
          status:          "enviado",
          mensagemEnviada: mensagem,
          canal,
          enviadoEm:       new Date(),
        })
        .where(eq(scoutOportunidadesTable.id, op.id));

      log.info({ tenantId, opId: op.id, clienteId: op.clienteId }, "scout/processar: mensagem enviada");
    } catch (err) {
      log.error({ err, opId: op.id }, "scout/processar: falha ao enviar (non-fatal)");
    }
  }
}

// ─── runRevenueScoutForTenant — executa varredura para um único tenant ────────

export async function runRevenueScoutForTenant(
  tenantId: string,
  log: Logger,
): Promise<{ clientesAnalisados: number; oportunidadesGeradas: number }> {
  const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  // Clientes com histórico beauty nos últimos 180 dias
  const beautyClientes = await db
    .select({ clienteId: beautyAgendamentosTable.clienteId })
    .from(beautyAgendamentosTable)
    .where(
      and(
        eq(beautyAgendamentosTable.tenantId, tenantId),
        gte(beautyAgendamentosTable.dataHora, cutoff180),
      ),
    );

  // Clientes com histórico clinic nos últimos 180 dias
  const clinicClientes = await db
    .select({ clienteId: clinicConsultasTable.pacienteId })
    .from(clinicConsultasTable)
    .where(
      and(
        eq(clinicConsultasTable.tenantId, tenantId),
        gte(clinicConsultasTable.dataHora, cutoff180),
      ),
    );

  // Todos os leads CRM do tenant (cobre verticais sem agendamentos beauty/clinic)
  const crmLeads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, tenantId))
    .limit(500);

  const clienteIds = [
    ...new Set([
      ...beautyClientes.map((r) => r.clienteId),
      ...clinicClientes.map((r) => r.clienteId),
      ...crmLeads.map((r) => r.id),
    ]),
  ];

  log.info({ tenantId, clientes: clienteIds.length }, "scout/run: analisando clientes");

  const antesCount = await db
    .select({ id: scoutOportunidadesTable.id })
    .from(scoutOportunidadesTable)
    .where(eq(scoutOportunidadesTable.tenantId, tenantId));

  for (const clienteId of clienteIds) {
    try {
      await analisarCliente(tenantId, clienteId, log);
    } catch (err) {
      log.error({ err, tenantId, clienteId }, "scout/run: analisarCliente falhou (non-fatal)");
    }
  }

  await processarOportunidades(tenantId, log);

  const depoisCount = await db
    .select({ id: scoutOportunidadesTable.id })
    .from(scoutOportunidadesTable)
    .where(eq(scoutOportunidadesTable.tenantId, tenantId));

  const oportunidadesGeradas = Math.max(0, depoisCount.length - antesCount.length);

  log.info({ tenantId, clientesAnalisados: clienteIds.length, oportunidadesGeradas }, "scout/run: concluído");

  return { clientesAnalisados: clienteIds.length, oportunidadesGeradas };
}

// ─── runRevenueScoutJob — orquestrador diário ─────────────────────────────────

export async function runRevenueScoutJob(log: Logger): Promise<void> {
  log.info("scout/job: iniciando varredura diária");

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  for (const tenant of tenants) {
    try {
      await runRevenueScoutForTenant(tenant.id, log);
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scout/job: tenant falhou (non-fatal)");
    }
  }

  log.info("scout/job: varredura diária concluída");
}

// ─── reconcileScoutOnDealWon — fecha o placar automaticamente ─────────────────
//
// Quando um deal vira "ganho", verifica se existe uma oportunidade do Revenue
// Scout com status "enviado" para o mesmo lead dentro de uma janela recente
// (padrão 45 dias) e, se sim, marca como convertida automaticamente — sem
// depender de um operador clicar em "converter" manualmente. Fora da janela,
// a venda é considerada não relacionada à oferta do Scout e nada é feito.
const RECONCILE_WINDOW_DIAS = 45;

export async function reconcileScoutOnDealWon(params: {
  tenantId: string;
  leadId: string;
  dealId: string;
  log: Logger;
  windowDias?: number;
}): Promise<{ reconciled: boolean; oportunidadeId?: string }> {
  const { tenantId, leadId, dealId, log, windowDias = RECONCILE_WINDOW_DIAS } = params;

  const candidatas = await db
    .select({
      id: scoutOportunidadesTable.id,
      enviadoEm: scoutOportunidadesTable.enviadoEm,
      createdAt: scoutOportunidadesTable.createdAt,
    })
    .from(scoutOportunidadesTable)
    .where(
      and(
        eq(scoutOportunidadesTable.tenantId, tenantId),
        eq(scoutOportunidadesTable.clienteId, leadId),
        eq(scoutOportunidadesTable.status, "enviado"),
      ),
    )
    .orderBy(desc(scoutOportunidadesTable.createdAt));

  if (candidatas.length === 0) return { reconciled: false };

  const cutoff = new Date(Date.now() - windowDias * 24 * 60 * 60 * 1000);
  const match = candidatas.find((o) => (o.enviadoEm ?? o.createdAt) >= cutoff);

  if (!match) {
    log.info(
      { tenantId, leadId, dealId, candidatas: candidatas.length, windowDias },
      "scout/reconcile: oportunidade(s) 'enviado' encontrada(s) mas fora da janela de correlação",
    );
    return { reconciled: false };
  }

  await db
    .update(scoutOportunidadesTable)
    .set({ status: "converteu", converteu: true, dealId })
    .where(eq(scoutOportunidadesTable.id, match.id));

  log.info(
    { tenantId, leadId, dealId, oportunidadeId: match.id },
    "scout/reconcile: oportunidade marcada como convertida automaticamente (deal ganho)",
  );

  return { reconciled: true, oportunidadeId: match.id };
}
