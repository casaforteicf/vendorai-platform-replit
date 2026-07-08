import { and, eq, ne, gte, lte, isNull, or, asc, count } from "drizzle-orm";
import {
  db,
  entregasTable,
  produtosCatalogoTable,
  usersTable,
  bloqueiosAgendaTable,
  propostasTable,
  type EntregaItem,
} from "@workspace/db";
import type { Logger } from "pino";
import { logger } from "./logger.js";

/**
 * Called after proposalAccepted() moves a deal to "ganho". Splits the
 * proposta's itens into one or more `entregas` records. Items whose catalog
 * product has exigeAgendamento=true still start as "aguardando" — they get
 * moved to modo="agendada" once a data/turno is confirmed (manual or
 * round-robin). Items without exigeAgendamento follow the async status flow.
 */
export async function createEntregasFromProposta(
  propostaId: string,
  log: Logger = logger
): Promise<{ created: number }> {
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, propostaId));

  if (!proposta || !proposta.dealId) {
    log.warn({ propostaId }, "createEntregasFromProposta: proposta or dealId missing, skipping");
    return { created: 0 };
  }

  const itens = proposta.itens ?? [];
  if (!itens.length) return { created: 0 };

  // Resolve exigeAgendamento per item via catalog lookup by nome (same
  // best-effort matching strategy used for inventory deduction).
  let anyExigeAgendamento = false;
  const entregaItens: EntregaItem[] = [];
  for (const item of itens) {
    entregaItens.push({ nome: item.nome, quantidade: item.quantidade, sku: item.sku });
    const [produto] = await db
      .select({ exigeAgendamento: produtosCatalogoTable.exigeAgendamento })
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, proposta.tenantId),
          eq(produtosCatalogoTable.nome, item.nome)
        )
      )
      .limit(1);
    if (produto?.exigeAgendamento) anyExigeAgendamento = true;
  }

  const [entrega] = await db
    .insert(entregasTable)
    .values({
      tenantId: proposta.tenantId,
      dealId: proposta.dealId,
      propostaId: proposta.id,
      leadId: proposta.leadId,
      modo: anyExigeAgendamento ? "agendada" : "assincrona",
      status: "aguardando",
      itens: entregaItens,
    })
    .returning();

  log.info({ dealId: proposta.dealId, entregaId: entrega.id, anyExigeAgendamento }, "createEntregasFromProposta: entrega created");

  return { created: 1 };
}

/**
 * Counts non-cancelled entregas for a motorista/date/turno, per spec rule:
 * COUNT(entregas WHERE assignedTo=X AND dataPrevista=Y AND periodo=Z AND status NOT IN ('cancelada'))
 */
async function countEntregasNoTurno(assignedTo: string, dataPrevista: Date, periodo: "manha" | "tarde"): Promise<number> {
  const dayStart = new Date(dataPrevista);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [row] = await db
    .select({ total: count() })
    .from(entregasTable)
    .where(
      and(
        eq(entregasTable.assignedTo, assignedTo),
        eq(entregasTable.periodo, periodo),
        gte(entregasTable.dataPrevista, dayStart),
        lte(entregasTable.dataPrevista, dayEnd),
        ne(entregasTable.status, "cancelada")
      )
    );

  return Number(row?.total ?? 0);
}

/** True when the motorista is blocked (bloqueios_agenda) for the given date/turno. */
async function isMotoristaBloqueado(responsavelId: string, data: Date, periodo: "manha" | "tarde"): Promise<boolean> {
  const bloqueios = await db
    .select()
    .from(bloqueiosAgendaTable)
    .where(
      and(
        eq(bloqueiosAgendaTable.responsavelId, responsavelId),
        lte(bloqueiosAgendaTable.dataInicio, data),
        gte(bloqueiosAgendaTable.dataFim, data)
      )
    );

  return bloqueios.some((b) => b.periodo === "dia_inteiro" || b.periodo === periodo);
}

export interface TurnoCapacityCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validates whether a motorista can take on an entrega for a given
 * data/turno: not blocked, and under limiteEntregasPorTurno (null = no limit).
 */
export async function checkTurnoCapacity(
  assignedTo: string,
  dataPrevista: Date,
  periodo: "manha" | "tarde"
): Promise<TurnoCapacityCheck> {
  if (await isMotoristaBloqueado(assignedTo, dataPrevista, periodo)) {
    return { ok: false, reason: "Motorista indisponível (agenda bloqueada) nesse turno" };
  }

  const [user] = await db
    .select({ limiteEntregasPorTurno: usersTable.limiteEntregasPorTurno })
    .from(usersTable)
    .where(eq(usersTable.id, assignedTo));

  const limite = user?.limiteEntregasPorTurno != null ? Number(user.limiteEntregasPorTurno) : null;
  if (limite == null) return { ok: true };

  const atual = await countEntregasNoTurno(assignedTo, dataPrevista, periodo);
  if (atual >= limite) {
    return { ok: false, reason: `Turno cheio para este motorista (${atual}/${limite})` };
  }

  return { ok: true };
}

/**
 * Round-robin selection of the next available motorista (userFunction
 * "entrega") for a given data/turno — mirrors pickNextVendedor's
 * lastAssignedAt rotation, but skips anyone blocked or at capacity.
 */
export async function pickNextMotorista(
  tenantId: string,
  dataPrevista: Date,
  periodo: "manha" | "tarde"
): Promise<string | null> {
  const motoristas = await db
    .select({ id: usersTable.id, lastAssignedAt: usersTable.lastAssignedAt })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, tenantId),
        eq(usersTable.active, true),
        eq(usersTable.userFunction, "entrega")
      )
    )
    .orderBy(asc(usersTable.lastAssignedAt));

  for (const motorista of motoristas) {
    const capacity = await checkTurnoCapacity(motorista.id, dataPrevista, periodo);
    if (capacity.ok) {
      await db
        .update(usersTable)
        .set({ lastAssignedAt: new Date() })
        .where(eq(usersTable.id, motorista.id));
      return motorista.id;
    }
  }

  return null;
}
