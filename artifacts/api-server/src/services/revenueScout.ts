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
import { and, eq, desc, gte, ne, isNotNull } from "drizzle-orm";
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
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface Condicoes {
  diasSemCompra?: number;
  diasSemVisita?: number;
  servicoId?: string;
  servicoSugeridoId?: string;
  servicoAtualId?: string;
  servicoPremiumId?: string;
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

// ─── analisarCliente ──────────────────────────────────────────────────────────

export async function analisarCliente(
  tenantId: string,
  clienteId: string,
  log: Logger,
): Promise<void> {
  // 1. Dados do cliente (lead)
  const [lead] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone, dataNascimento: leadsTable.dataNascimento })
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

    await db.insert(scoutOportunidadesTable).values({
      tenantId,
      clienteId,
      regraId:   regra.id,
      tipo:      regra.tipo,
      descricao: `Regra "${regra.nome}" disparada para ${lead.nome ?? clienteId}`,
      status:    "pendente",
    } as any);

    // Incrementa contador de disparos da regra
    await db
      .update(scoutRegrasTable)
      .set({ totalDisparos: (regra.totalDisparos ?? 0) + 1 })
      .where(eq(scoutRegrasTable.id, regra.id));

    log.info({ tenantId, clienteId, regraId: regra.id, tipo: regra.tipo }, "scout: oportunidade inserida");
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
    .limit(50);

  if (oportunidades.length === 0) return;

  log.info({ tenantId, count: oportunidades.length }, "scout/processar: oportunidades pendentes");

  for (const op of oportunidades) {
    try {
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

// ─── runRevenueScoutJob — orquestrador diário ─────────────────────────────────

export async function runRevenueScoutJob(log: Logger): Promise<void> {
  log.info("scout/job: iniciando varredura diária");

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  for (const tenant of tenants) {
    try {
      // Clientes ativos nos últimos 180 dias — beauty
      const beautyClientes = await db
        .select({ clienteId: beautyAgendamentosTable.clienteId })
        .from(beautyAgendamentosTable)
        .where(
          and(
            eq(beautyAgendamentosTable.tenantId, tenant.id),
            gte(beautyAgendamentosTable.dataHora, cutoff180),
          ),
        );

      // Clientes ativos nos últimos 180 dias — clinic
      const clinicClientes = await db
        .select({ clienteId: clinicConsultasTable.pacienteId })
        .from(clinicConsultasTable)
        .where(
          and(
            eq(clinicConsultasTable.tenantId, tenant.id),
            gte(clinicConsultasTable.dataHora, cutoff180),
          ),
        );

      const clienteIds = [
        ...new Set([
          ...beautyClientes.map((r) => r.clienteId),
          ...clinicClientes.map((r) => r.clienteId),
        ]),
      ];

      log.info({ tenantId: tenant.id, clientes: clienteIds.length }, "scout/job: analisando clientes");

      for (const clienteId of clienteIds) {
        try {
          await analisarCliente(tenant.id, clienteId, log);
        } catch (err) {
          log.error({ err, tenantId: tenant.id, clienteId }, "scout/job: analisarCliente falhou (non-fatal)");
        }
      }

      // Depois de analisar: processar oportunidades pendentes
      await processarOportunidades(tenant.id, log);

      log.info({ tenantId: tenant.id, clientes: clienteIds.length }, "scout/job: tenant concluído");
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scout/job: tenant falhou (non-fatal)");
    }
  }

  log.info("scout/job: varredura diária concluída");
}
