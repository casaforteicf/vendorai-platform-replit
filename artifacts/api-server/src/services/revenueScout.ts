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
import { and, eq, desc, gte, ne, isNotNull, or, lte, isNull, inArray } from "drizzle-orm";
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
  receitasMedicasTable,
  farmaciaPedidoTable,
  farmaciaPedidoItemTable,
  farmaciaProdutoTable,
  type PropostaItem,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { triggerSequenceOffer } from "./sequence-offer.js";
import { runInsuranceRenewalForTenant } from "./insuranceRenewalEngine.js";
import { runInsuranceWhitespaceForTenant } from "./insuranceWhitespaceEngine.js";
import { runDistributorRevenueForTenant } from "./distributorRevenueEngine.js";
import { runVerticalRevenueForTenant, normalize } from "./verticalRevenueEngine.js";
import { isWithinBusinessHours, renderTemplate } from "../lib/proactiveMessageGuard.js";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";
import { isSentProposalStatus, requiresSentProposalContext } from "../lib/scoutBudgetGuard.js";
import { isBirthdayOn } from "../lib/birthday-date.js";

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
  mesGatilho?: number;
  diasSemCompraMinimo?: number;
  diasParado?: number;
  valorMinimo?: number;
  diasAntesVencimento?: number;
  diasAntesVencimentoProduto?: number;
  percentualMaximoUtilizado?: number;
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

  // Compras concluidas na Central da Farmacia tambem alimentam recorrencia e
  // recompra no Scout. O vinculo usa o produto do catalogo compartilhado.
  const comprasFarmacia = await db
    .select({ data: farmaciaPedidoTable.updatedAt })
    .from(farmaciaPedidoTable)
    .innerJoin(farmaciaPedidoItemTable, eq(farmaciaPedidoItemTable.pedidoId, farmaciaPedidoTable.id))
    .innerJoin(farmaciaProdutoTable, eq(farmaciaProdutoTable.id, farmaciaPedidoItemTable.produtoId))
    .where(and(
      eq(farmaciaPedidoTable.tenantId, tenantId),
      eq(farmaciaPedidoTable.leadId, leadId),
      eq(farmaciaPedidoTable.status, "entregue"),
      or(
        eq(farmaciaPedidoItemTable.produtoId, produtoId),
        eq(farmaciaProdutoTable.produtoCatalogoId, produtoId),
      ),
    ))
    .orderBy(desc(farmaciaPedidoTable.updatedAt))
    .limit(1);

  const dataFarmacia = comprasFarmacia[0]?.data ?? null;
  if (dataFarmacia && (!melhorData || dataFarmacia > melhorData)) melhorData = dataFarmacia;
  return melhorData;
}

/**
 * Retorna a data da compra (proposta aceita) mais recente do lead, de
 * qualquer produto — usada pra reativação sazonal, que não olha um produto
 * específico, só "esse cliente comprou alguma coisa na temporada passada?".
 */
async function dataUltimaCompraGeral(tenantId: string, leadId: string): Promise<Date | null> {
  const propostas = await db
    .select({ acceptedAt: propostasTable.acceptedAt, updatedAt: propostasTable.updatedAt })
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
    const data = p.acceptedAt ?? p.updatedAt;
    if (!melhorData || data > melhorData) melhorData = data;
  }
  return melhorData;
}

interface Acao {
  requiresApproval?: boolean;
  mensagem?: string;
  canal?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCond(raw: unknown): Condicoes {
  return (raw ?? {}) as Condicoes;
}

export function parseAcao(raw: unknown): Acao {
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
    receita_vencendo:  78,
    produto_vencendo:  76,
    upgrade:           75,
    limite_credito_disponivel: 60,
    orcamento_parado:  70,
    grade_incompleta:  68,
    cross_sell:        65,
    aniversario:       60,
    reativacao_sazonal:58,
    recompra:          55,
    reativacao:        45,
  };
  const base = bases[tipo ?? ""] ?? 50;
  const bonus = diasEsperado > 0 && diasDesdeUltimo > diasEsperado * 1.5 ? 10 : 0;
  return Math.min(base + bonus, 100);
}

/** Retorna true se o mês e dia do dataNascimento coincidem com hoje. */
function isAniversarioHoje(dataNascimento: string | null): boolean {
  const today = new Date();
  return isBirthdayOn(dataNascimento, today.getMonth() + 1, today.getDate());
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
      limiteCredito: leadsTable.limiteCredito,
      creditoUtilizado: leadsTable.creditoUtilizado,
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

    // The vertical engine evaluates these rules from accepted proposals.
    // Skipping them here prevents duplicate generic opportunities.
    if ((regra.condicoes as { engine?: string } | null)?.engine === "vertical_revenue_v1") continue;

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
      captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

      await db
        .update(scoutRegrasTable)
        .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
        .where(eq(scoutRegrasTable.id, regra.id));

      log.info({ tenantId, clienteId, regraId: regra.id, tipo: regra.tipo, score: scoreSeq }, "scout: oportunidade sequencia_produto inserida");
      continue;
    }

    // "reativacao_sazonal" dispara uma vez por ano, a partir do mês
    // configurado (ex: outubro, pra antecipar a campanha de verão) — pra
    // clientes que compraram em temporadas passadas mas ainda não compraram
    // nesta janela. Diferente de "reativacao" (baseada só em dias corridos),
    // aqui o gatilho é o calendário, não a recência absoluta.
    if (regra.tipo === "reativacao_sazonal") {
      const mesGatilho = cond.mesGatilho;
      if (!mesGatilho || mesGatilho < 1 || mesGatilho > 12) continue;

      const now = new Date();
      const anoAtual = now.getFullYear();
      // Janela da campanha: do dia 1 do mês-gatilho até o fim do ano.
      const inicioJanela = new Date(anoAtual, mesGatilho - 1, 1);
      if (now < inicioJanela) continue;

      const dataCompra = await dataUltimaCompraGeral(tenantId, clienteId);
      if (!dataCompra) continue; // nunca comprou — não é reativação, é prospecção

      // Já comprou dentro da janela desta temporada? Não precisa reativar.
      if (dataCompra >= inicioJanela) continue;

      const diasSemComprar = Math.floor((Date.now() - dataCompra.getTime()) / (1000 * 60 * 60 * 24));
      if (diasSemComprar < (cond.diasSemCompraMinimo ?? 0)) continue;

      // Dedup: só uma oportunidade por cliente+regra por ano-safra.
      const [jaDisparouEsteAno] = await db
        .select({ id: scoutOportunidadesTable.id })
        .from(scoutOportunidadesTable)
        .where(
          and(
            eq(scoutOportunidadesTable.tenantId, tenantId),
            eq(scoutOportunidadesTable.clienteId, clienteId),
            eq(scoutOportunidadesTable.regraId, regra.id),
            gte(scoutOportunidadesTable.createdAt, inicioJanela),
          ),
        )
        .limit(1);
      if (jaDisparouEsteAno) continue;

      const baseScoreSaz = calcularScoreOportunidade("reativacao_sazonal", diasSemComprar, 180);
      const intentBoostSaz = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
      const scoreSaz = Math.min(baseScoreSaz + intentBoostSaz, 100);

      await db.insert(scoutOportunidadesTable).values({
        tenantId,
        clienteId,
        regraId:           regra.id,
        tipo:              regra.tipo,
        descricao:         `Reativação sazonal: ${lead.nome ?? clienteId} comprou na temporada passada e ainda não voltou este ano`,
        status:            "pendente",
        scoreOportunidade: String(scoreSaz),
      } as any);
      captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

      await db
        .update(scoutRegrasTable)
        .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
        .where(eq(scoutRegrasTable.id, regra.id));

      log.info({ tenantId, clienteId, regraId: regra.id }, "scout: oportunidade reativacao_sazonal inserida");
      continue;
    }

    // "orcamento_parado" — orçamento enviado/pendente que não avançou (não
    // virou venda nem foi recusado) há X dias. Universal, qualquer vertical
    // que use o módulo de Propostas — não precisa de catálogo nem histórico
    // de compra, só um orçamento parado no funil.
    //
    // Detecta tanto "enviada" quanto "pendente" (17/09 — corrigido: só
    // detectava "enviada", oportunidade nunca era criada pra propostas em
    // "pendente" mesmo esse sendo o status seguinte de "enviada" no fluxo
    // real). Isso é seguro mesmo "pendente" tecnicamente sendo alcançável
    // também a partir de "rascunho" na máquina de estados (PROPOSTA_TRANSITIONS
    // em routes/propostas.ts) — hoje nenhum caminho real (UI ou backend) usa
    // esse atalho, só "enviada → pendente" é exercitado. Mesmo assim, o
    // envio automático de mensagem citando o orçamento continua exigindo
    // "enviada" estrito via isSentProposalStatus (scoutBudgetGuard.ts) — não
    // relaxado aqui — então mesmo se algum dia esse atalho passar a ser
    // usado, o pior caso é a oportunidade ser criada e depois marcada
    // "ignorado" no envio, nunca uma mensagem indevida.
    if (regra.tipo === "orcamento_parado") {
      const diasParado = cond.diasParado ?? 7;
      const cutoffParado = new Date(Date.now() - diasParado * 24 * 60 * 60 * 1000);

      const parados = await db
        .select({
          id: propostasTable.id,
          titulo: propostasTable.titulo,
          valorTotal: propostasTable.valorTotal,
          updatedAt: propostasTable.updatedAt,
        })
        .from(propostasTable)
        .where(
          and(
            eq(propostasTable.tenantId, tenantId),
            eq(propostasTable.leadId, clienteId),
            or(eq(propostasTable.status, "enviada"), eq(propostasTable.status, "pendente")),
            lte(propostasTable.updatedAt, cutoffParado),
          ),
        )
        .orderBy(desc(propostasTable.valorTotal));

      for (const proposta of parados) {
        const valor = Number(proposta.valorTotal ?? 0);
        if (cond.valorMinimo && valor < cond.valorMinimo) continue;

        // Dedup por orçamento específico — cada proposta parada só vira
        // 1 oportunidade ativa por vez (nova checagem depois que ela
        // deixar de estar pendente/ignorada libera de novo).
        const [existentePendente] = await db
          .select({ id: scoutOportunidadesTable.id })
          .from(scoutOportunidadesTable)
          .where(
            and(
              eq(scoutOportunidadesTable.tenantId, tenantId),
              eq(scoutOportunidadesTable.clienteId, clienteId),
              eq(scoutOportunidadesTable.regraId, regra.id),
              eq(scoutOportunidadesTable.propostaId, proposta.id),
              eq(scoutOportunidadesTable.status, "pendente"),
            ),
          )
          .limit(1);
        if (existentePendente) continue;

        const diasParadoReal = Math.floor((Date.now() - proposta.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
        const baseScoreOrc = calcularScoreOportunidade("orcamento_parado", diasParadoReal, diasParado);
        const intentBoostOrc = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
        // Orçamento de valor alto pesa mais na priorização — sobe até +15
        const valorBoost = valor > 5000 ? 15 : valor > 1000 ? 8 : 0;
        const scoreOrc = Math.min(baseScoreOrc + intentBoostOrc + valorBoost, 100);

        await db.insert(scoutOportunidadesTable).values({
          tenantId,
          clienteId,
          regraId:           regra.id,
          propostaId:        proposta.id,
          tipo:              regra.tipo,
          descricao:         `Orçamento "${proposta.titulo}" (R$ ${valor.toFixed(2)}) parado há ${diasParadoReal} dias — ${lead.nome ?? clienteId}`,
          status:            "pendente",
          valorEstimado:     String(valor),
          scoreOportunidade: String(scoreOrc),
        } as any);
        captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

        await db
          .update(scoutRegrasTable)
          .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
          .where(eq(scoutRegrasTable.id, regra.id));

        log.info({ tenantId, clienteId, regraId: regra.id, propostaId: proposta.id }, "scout: oportunidade orcamento_parado inserida");
      }
      continue;
    }

    // "grade_incompleta" — cliente comprou uma peça que tem outros
    // tamanhos/cores cadastrados (mesmo grupoVarianteId) e ainda não levou
    // nenhuma das outras variantes. Diferente de sequencia_produto (par
    // fixo origem→sugestão), aqui a sugestão é dinâmica: qualquer variante
    // irmã ainda não comprada.
    if (regra.tipo === "grade_incompleta") {
      const diasApos = cond.diasApos ?? 7;

      const propostasAceitas = await db
        .select({ itens: propostasTable.itens, acceptedAt: propostasTable.acceptedAt, updatedAt: propostasTable.updatedAt })
        .from(propostasTable)
        .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, clienteId), eq(propostasTable.status, "aceita")));

      const produtosCompradosIds = new Set<string>();
      for (const p of propostasAceitas) {
        for (const item of p.itens ?? []) {
          if (item.produtoId) produtosCompradosIds.add(item.produtoId);
        }
      }

      for (const p of propostasAceitas) {
        const dataCompra = p.acceptedAt ?? p.updatedAt;
        const diasDesdeCompraGrade = Math.floor((Date.now() - dataCompra.getTime()) / (1000 * 60 * 60 * 24));
        if (diasDesdeCompraGrade < diasApos) continue;

        for (const item of p.itens ?? []) {
          if (!item.produtoId) continue;
          const [produtoComprado] = await db.select().from(produtosCatalogoTable).where(eq(produtosCatalogoTable.id, item.produtoId));
          if (!produtoComprado?.grupoVarianteId) continue;

          const siblings = await db.select().from(produtosCatalogoTable)
            .where(and(eq(produtosCatalogoTable.grupoVarianteId, produtoComprado.grupoVarianteId), eq(produtosCatalogoTable.ativo, true)));
          const faltantes = siblings.filter((s) => s.id !== produtoComprado.id && !produtosCompradosIds.has(s.id));
          if (faltantes.length === 0) continue;

          const [existentePendente] = await db
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
          if (existentePendente) continue;

          const nomesVariantes = faltantes.slice(0, 4).map((f) => [f.tamanho, f.cor].filter(Boolean).join("/")).join(", ");
          const baseScoreGrade = calcularScoreOportunidade("grade_incompleta", diasDesdeCompraGrade, diasApos);
          const intentBoostGrade = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
          const scoreGrade = Math.min(baseScoreGrade + intentBoostGrade, 100);

          await db.insert(scoutOportunidadesTable).values({
            tenantId,
            clienteId,
            regraId:           regra.id,
            tipo:              regra.tipo,
            descricao:         `${lead.nome ?? clienteId} levou "${produtoComprado.nome}" — ainda tem em ${nomesVariantes || "outras variantes"}`,
            status:            "pendente",
            scoreOportunidade: String(scoreGrade),
          } as any);
          captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

          await db
            .update(scoutRegrasTable)
            .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
            .where(eq(scoutRegrasTable.id, regra.id));

          log.info({ tenantId, clienteId, regraId: regra.id }, "scout: oportunidade grade_incompleta inserida");
        }
      }
      continue;
    }

    // "receita_vencendo" — receita médica (comum ou controlada) do cliente
    // vencendo em breve, sem renovação registrada ainda. Farmácia pediu
    // isso especificamente pra medicamento de uso contínuo/controlado.
    if (regra.tipo === "receita_vencendo") {
      const diasAntes = cond.diasAntesVencimento ?? 5;
      const limite = new Date(Date.now() + diasAntes * 24 * 60 * 60 * 1000);

      const receitasVencendo = await db.select().from(receitasMedicasTable)
        .where(
          and(
            eq(receitasMedicasTable.tenantId, tenantId),
            eq(receitasMedicasTable.clienteId, clienteId),
            eq(receitasMedicasTable.status, "ativa"),
            lte(receitasMedicasTable.dataValidade, limite),
          ),
        );

      for (const receita of receitasVencendo) {
        const diasParaVencer = Math.ceil((receita.dataValidade.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const [existentePendente] = await db
          .select({ id: scoutOportunidadesTable.id })
          .from(scoutOportunidadesTable)
          .where(
            and(
              eq(scoutOportunidadesTable.tenantId, tenantId),
              eq(scoutOportunidadesTable.clienteId, clienteId),
              eq(scoutOportunidadesTable.regraId, regra.id),
              eq(scoutOportunidadesTable.status, "pendente"),
            ),
          );
        if (existentePendente) continue;

        const urgenciaBoost = diasParaVencer <= 2 ? 15 : diasParaVencer <= 5 ? 8 : 0;
        const baseScoreReceita = calcularScoreOportunidade("receita_vencendo", diasAntes - diasParaVencer, diasAntes);
        const intentBoostReceita = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
        const scoreReceita = Math.min(baseScoreReceita + intentBoostReceita + urgenciaBoost, 100);

        const descricaoVencimento = diasParaVencer < 0
          ? `Receita de ${receita.medicamentoNome} venceu há ${Math.abs(diasParaVencer)} dias`
          : `Receita de ${receita.medicamentoNome} vence em ${diasParaVencer} dias`;

        await db.insert(scoutOportunidadesTable).values({
          tenantId,
          clienteId,
          regraId:           regra.id,
          tipo:              regra.tipo,
          descricao:         `${descricaoVencimento} — ${lead.nome ?? clienteId}${receita.tipo === "controlado" ? " (medicamento controlado)" : ""}`,
          status:            "pendente",
          scoreOportunidade: String(scoreReceita),
        } as any);
        captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

        await db
          .update(scoutRegrasTable)
          .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
          .where(eq(scoutRegrasTable.id, regra.id));

        log.info({ tenantId, clienteId, regraId: regra.id, receitaId: receita.id }, "scout: oportunidade receita_vencendo inserida");
      }
      continue;
    }

    // "produto_vencendo" — produto com validade de lote próxima que esse
    // cliente já comprou antes. Diferente de receita_vencendo (validade
    // de prescrição médica), aqui é validade de PRODUTO/estoque — pedido
    // da distribuidora de alimentos, mas serve pra qualquer vertical com
    // produto perecível.
    if (regra.tipo === "produto_vencendo") {
      const diasAntesProduto = cond.diasAntesVencimentoProduto ?? 15;
      const limiteProduto = new Date(Date.now() + diasAntesProduto * 24 * 60 * 60 * 1000);

      const propostasClienteVencendo = await db
        .select({ itens: propostasTable.itens })
        .from(propostasTable)
        .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, clienteId), eq(propostasTable.status, "aceita")));

      const produtosCompradosPorLead = new Set<string>();
      for (const p of propostasClienteVencendo) {
        for (const item of p.itens ?? []) {
          if (item.produtoId) produtosCompradosPorLead.add(item.produtoId);
        }
      }
      if (produtosCompradosPorLead.size === 0) { continue; }

      const produtosVencendo = await db.select().from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            eq(produtosCatalogoTable.ativo, true),
            isNotNull(produtosCatalogoTable.dataValidade),
            lte(produtosCatalogoTable.dataValidade, limiteProduto),
            inArray(produtosCatalogoTable.id, Array.from(produtosCompradosPorLead)),
          ),
        );

      for (const produto of produtosVencendo) {
        const diasParaVencerProduto = produto.dataValidade
          ? Math.ceil((produto.dataValidade.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        const [existentePendenteProduto] = await db
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
        if (existentePendenteProduto) continue;

        const urgenciaBoostProduto = diasParaVencerProduto <= 3 ? 15 : diasParaVencerProduto <= 7 ? 8 : 0;
        const baseScoreProduto = calcularScoreOportunidade("produto_vencendo", diasAntesProduto - diasParaVencerProduto, diasAntesProduto);
        const intentBoostProduto = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
        const scoreProduto = Math.min(baseScoreProduto + intentBoostProduto + urgenciaBoostProduto, 100);

        await db.insert(scoutOportunidadesTable).values({
          tenantId,
          clienteId,
          regraId:           regra.id,
          tipo:              regra.tipo,
          descricao:         `${produto.nome} vence em ${diasParaVencerProduto} dias — ${lead.nome ?? clienteId} já comprou esse produto antes, oferecer com desconto`,
          status:            "pendente",
          scoreOportunidade: String(scoreProduto),
        } as any);
        captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

        await db
          .update(scoutRegrasTable)
          .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
          .where(eq(scoutRegrasTable.id, regra.id));

        log.info({ tenantId, clienteId, regraId: regra.id, produtoId: produto.id }, "scout: oportunidade produto_vencendo inserida");
      }
      continue;
    }

    // "limite_credito_disponivel" — cliente B2B com folga real no limite
    // de crédito (usou pouco do que tem disponível) e sinal de interesse
    // recente — oportunidade de estimular compra maior, não de cobrança.
    // Diferente de todas as outras regras: não é baseada em tempo, é
    // baseada em proporção usado/limite.
    if (regra.tipo === "limite_credito_disponivel") {
      const percentualMax = cond.percentualMaximoUtilizado ?? 50;
      const limite = lead.limiteCredito != null ? Number(lead.limiteCredito) : null;
      const utilizado = lead.creditoUtilizado != null ? Number(lead.creditoUtilizado) : 0;

      if (!limite || limite <= 0) { continue; }
      const percentualUtilizado = (utilizado / limite) * 100;
      if (percentualUtilizado > percentualMax) { continue; }

      const [existentePendenteCredito] = await db
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
      if (existentePendenteCredito) { continue; }

      const disponivel = limite - utilizado;
      const baseScoreCredito = calcularScoreOportunidade("limite_credito_disponivel", 0, 1);
      const intentBoostCredito = Math.min(Math.floor((lead.intentScore ?? 0) / 10) * 5, 15);
      const folgaBoost = percentualUtilizado <= 20 ? 15 : percentualUtilizado <= 35 ? 8 : 0;
      const scoreCredito = Math.min(baseScoreCredito + intentBoostCredito + folgaBoost, 100);

      await db.insert(scoutOportunidadesTable).values({
        tenantId,
        clienteId,
        regraId:           regra.id,
        tipo:              regra.tipo,
        descricao:         `${lead.nome ?? clienteId} usou só ${percentualUtilizado.toFixed(0)}% do limite de crédito (R$ ${disponivel.toFixed(2)} disponível) — estimular pedido maior`,
        status:            "pendente",
        valorEstimado:     String(disponivel),
        scoreOportunidade: String(scoreCredito),
      } as any);
      captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

      await db
        .update(scoutRegrasTable)
        .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
        .where(eq(scoutRegrasTable.id, regra.id));

      log.info({ tenantId, clienteId, regraId: regra.id }, "scout: oportunidade limite_credito_disponivel inserida");
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
      explanation: {
        facts: {
          regra: regra.nome,
          tipo: regra.tipo,
          dias_desde_ultimo_atendimento: diasDesdeUltimo,
          score_de_prioridade: score,
        },
        inference: {
          resumo: `A regra "${regra.nome}" identificou potencial de ${regra.tipo} para este cliente.`,
          motivo: "As condições configuradas na regra foram atendidas pelos dados disponíveis do lead.",
        },
        autonomy: {
          requer_confirmacao_humana: true,
          contato_automatico: false,
        },
      },
    } as any);
    captureLeadFeatureSnapshot(tenantId, clienteId, "scout_oportunidade_criada", { tipoRegra: regra.tipo }, log).catch(() => {});

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
  const [tenant] = await db
    .select({ horarioComercialInicio: tenantsTable.horarioComercialInicio, horarioComercialFim: tenantsTable.horarioComercialFim })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  // Scout só dispara mensagem ESPONTÂNEA dentro do horário comercial do
  // tenant — fica pra próxima rodada, nada se perde, só adia.
  if (!tenant || !isWithinBusinessHours(tenant)) {
    log.info({ tenantId }, "scout/processar: fora do horário comercial, adiado");
    return;
  }

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
      const [regraCheck] = await db
        .select({ acao: scoutRegrasTable.acao })
        .from(scoutRegrasTable)
        .where(eq(scoutRegrasTable.id, op.regraId));
      const acaoCheck = parseAcao(regraCheck?.acao);

      // Regra marcada pra exigir aprovação humana — fica "pendente" mesmo,
      // não dispara sozinha. O ADM aprova (com ou sem editar a mensagem)
      // na tela de Oportunidades.
      if (acaoCheck.requiresApproval) {
        continue;
      }

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

      // Personaliza mensagem — recusa enviar se sobrar placeholder não
      // resolvido em vez de mandar algo tipo "Olá {Nome Errado}," pro cliente.
      const template = acao.mensagem ?? "Olá {nome}, temos uma novidade para você!";
      const rendered = renderTemplate(template, { nome: lead.nome ?? "", nome_cliente: lead.nome ?? "" });
      if (!rendered.ok) {
        log.error({ tenantId, oportunidadeId: op.id, regraId: op.regraId, motivo: rendered.motivoFalha }, "scout/processar: mensagem da regra com placeholder quebrado, envio bloqueado");
        await db
          .update(scoutOportunidadesTable)
          .set({ status: "ignorado" })
          .where(eq(scoutOportunidadesTable.id, op.id));
        continue;
      }
      const mensagem = rendered.mensagem;

      // Uma mensagem sobre orcamento/proposta nunca pode ser enviada com base
      // apenas no texto de uma regra. Exigimos o vinculo com a proposta deste
      // tenant/lead e confirmamos novamente que ela foi realmente enviada.
      // Isso tambem neutraliza oportunidades antigas ou regras mal configuradas.
      if (requiresSentProposalContext(op.tipo, mensagem)) {
        const [propostaEnviada] = op.propostaId
          ? await db
              .select({ status: propostasTable.status })
              .from(propostasTable)
              .where(
                and(
                  eq(propostasTable.id, op.propostaId),
                  eq(propostasTable.tenantId, tenantId),
                  eq(propostasTable.leadId, op.clienteId),
                ),
              )
              .limit(1)
          : [];

        if (!propostaEnviada || !isSentProposalStatus(propostaEnviada.status)) {
          log.warn(
            { tenantId, oportunidadeId: op.id, leadId: op.clienteId, propostaId: op.propostaId },
            "scout/processar: mensagem de orcamento bloqueada sem proposta enviada valida",
          );
          await db
            .update(scoutOportunidadesTable)
            .set({ status: "ignorado" })
            .where(eq(scoutOportunidadesTable.id, op.id));
          continue;
        }
      }

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

  // Seguros Corporativos opera em modo de aprovação: cria/atualiza oportunidades,
  // mas não as envia automaticamente (status pendente_aprovacao).
  // Só roda pra tenants dessa vertical — antes rodava pra TODO tenant da
  // plataforma sem checar nada, criando as regras "Whitespace de seguros" e
  // "Renovação de apólices" até pra loja de piscina, salão de beleza etc.
  const [tenantVerticalRow] = await db
    .select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (normalize(tenantVerticalRow?.vertical ?? "").includes("seguro")) {
    await runInsuranceRenewalForTenant(tenantId, log);
    await runInsuranceWhitespaceForTenant(tenantId, log);
  }

  // Distribuidoras usam histórico de propostas aceitas e ciclos próprios por segmento.
  // As sugestões ficam em pendente_aprovacao e nunca são contatadas automaticamente.
  await runDistributorRevenueForTenant(tenantId, log);
  await runVerticalRevenueForTenant(tenantId, log);

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
