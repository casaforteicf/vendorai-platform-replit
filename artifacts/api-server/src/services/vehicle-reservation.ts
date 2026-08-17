import { and, eq, inArray, lte } from "drizzle-orm";
import {
  db, adCampaignsTable, dealsTable, leadsTable, notificationsTable,
  vehicleAdReservationsTable, veiculosEstoqueTable,
} from "@workspace/db";

const ACTIVE = ["em_negociacao", "justificativa_pendente"] as const;

export async function reserveUniqueVehicle(input: {
  tenantId: string; campaignId: string; leadId: string; sellerId?: string | null;
}) {
  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, input.campaignId), eq(adCampaignsTable.tenantId, input.tenantId),
  ));
  if (!campaign || campaign.itemTipo !== "veiculo" || campaign.modo !== "unico" || !campaign.itemId) {
    throw new Error("A campanha precisa anunciar um único veículo");
  }
  const [lead] = await db.select().from(leadsTable).where(and(
    eq(leadsTable.id, input.leadId), eq(leadsTable.tenantId, input.tenantId),
  ));
  if (!lead) throw new Error("Lead não encontrado");
  const [vehicle] = await db.select().from(veiculosEstoqueTable).where(and(
    eq(veiculosEstoqueTable.id, campaign.itemId), eq(veiculosEstoqueTable.tenantId, input.tenantId),
  ));
  if (!vehicle) throw new Error("Veículo não encontrado");

  const [busy] = await db.select().from(vehicleAdReservationsTable).where(and(
    eq(vehicleAdReservationsTable.vehicleId, vehicle.id),
    inArray(vehicleAdReservationsTable.status, [...ACTIVE]),
  ));
  if (busy) {
    if (busy.leadId === lead.id) return busy;
    throw new Error("Este veículo já está reservado para outro lead");
  }

  const sellerId = input.sellerId ?? vehicle.vendedorResponsavelId ?? campaign.responsavelId ?? lead.assignedTo ?? null;
  const due = new Date(Date.now() + Math.max(1, campaign.slaNegociacaoHoras) * 3_600_000);
  let [deal] = await db.select().from(dealsTable).where(and(
    eq(dealsTable.tenantId, input.tenantId), eq(dealsTable.leadId, lead.id),
    inArray(dealsTable.etapa, ["em_aquecimento", "novo", "qualificado", "proposta", "negociacao"]),
  )).limit(1);
  if (!deal) {
    [deal] = await db.insert(dealsTable).values({
      tenantId: input.tenantId, leadId: lead.id,
      titulo: `${vehicle.marca} ${vehicle.modelo} — ${lead.nome}`,
      valor: vehicle.valorPromocional ?? vehicle.valor,
      etapa: "negociacao", assignedTo: sellerId, vehicleReservationDueAt: due,
    }).returning();
  } else {
    [deal] = await db.update(dealsTable).set({ etapa: "negociacao", assignedTo: sellerId, vehicleReservationDueAt: due, vehicleReservationBlocked: false, updatedAt: new Date() })
      .where(eq(dealsTable.id, deal.id)).returning();
  }

  const [reservation] = await db.insert(vehicleAdReservationsTable).values({
    tenantId: input.tenantId, campaignId: campaign.id, vehicleId: vehicle.id,
    leadId: lead.id, dealId: deal!.id, sellerId, justificationDueAt: due,
  }).returning();
  await db.update(leadsTable).set({ adCampaignId: campaign.id, assignedTo: sellerId, updatedAt: new Date() })
    .where(eq(leadsTable.id, lead.id));
  await db.update(veiculosEstoqueTable).set({ status: "reservado", updatedAt: new Date() })
    .where(eq(veiculosEstoqueTable.id, vehicle.id));
  if (campaign.pausarAoInteresse) {
    await db.update(adCampaignsTable).set({ status: "pausado", updatedAt: new Date() })
      .where(eq(adCampaignsTable.id, campaign.id));
  }
  await db.insert(notificationsTable).values({
    tenantId: input.tenantId, type: "info", category: "vehicle_reservation",
    title: "Veículo reservado e anúncio pausado",
    message: `${vehicle.marca} ${vehicle.modelo} foi reservado para ${lead.nome}. O vendedor tem até ${due.toLocaleString("pt-BR")} para atualizar a negociação.`,
  });
  return reservation!;
}

export async function markOverdueVehicleReservations() {
  const overdue = await db.select().from(vehicleAdReservationsTable).where(and(
    eq(vehicleAdReservationsTable.status, "em_negociacao"),
    lte(vehicleAdReservationsTable.justificationDueAt, new Date()),
  ));
  for (const item of overdue) {
    await db.update(vehicleAdReservationsTable).set({ status: "justificativa_pendente", updatedAt: new Date() })
      .where(eq(vehicleAdReservationsTable.id, item.id));
    await db.update(dealsTable).set({ vehicleReservationBlocked: true, updatedAt: new Date() })
      .where(eq(dealsTable.id, item.dealId));
    await db.insert(notificationsTable).values({
      tenantId: item.tenantId, type: "warning", category: "vehicle_reservation_sla",
      title: "Negociação de veículo exige justificativa",
      message: "O prazo de 48 horas venceu. Justifique para manter, avançar ou marcar a oportunidade como perdida.",
    });
  }
  return overdue.length;
}

export async function decideVehicleReservation(input: {
  tenantId: string; reservationId: string; userId?: string | null;
  decision: "manter" | "avancar" | "perdido"; justification: string;
}) {
  if (input.justification.trim().length < 10) throw new Error("Informe uma justificativa com pelo menos 10 caracteres");
  const [item] = await db.select().from(vehicleAdReservationsTable).where(and(
    eq(vehicleAdReservationsTable.id, input.reservationId), eq(vehicleAdReservationsTable.tenantId, input.tenantId),
    inArray(vehicleAdReservationsTable.status, [...ACTIVE]),
  ));
  if (!item) throw new Error("Reserva ativa não encontrada");
  const now = new Date();
  if (input.decision === "manter") {
    const nextDue = new Date(now.getTime() + 48 * 3_600_000);
    await db.update(dealsTable).set({ vehicleReservationBlocked: false, vehicleReservationDueAt: nextDue, updatedAt: now })
      .where(eq(dealsTable.id, item.dealId));
    const [updated] = await db.update(vehicleAdReservationsTable).set({
      status: "em_negociacao", decision: "manter", justification: input.justification.trim(),
      decidedBy: input.userId ?? null, decidedAt: now,
      justificationDueAt: nextDue, updatedAt: now,
    }).where(eq(vehicleAdReservationsTable.id, item.id)).returning();
    return updated!;
  }
  if (input.decision === "avancar") {
    const nextDue = new Date(now.getTime() + 48 * 3_600_000);
    await db.update(dealsTable).set({ etapa: "proposta", vehicleReservationBlocked: false, vehicleReservationDueAt: nextDue, updatedAt: now }).where(eq(dealsTable.id, item.dealId));
    const [updated] = await db.update(vehicleAdReservationsTable).set({
      status: "em_negociacao", decision: "avancar", justification: input.justification.trim(),
      decidedBy: input.userId ?? null, decidedAt: now,
      justificationDueAt: nextDue, updatedAt: now,
    }).where(eq(vehicleAdReservationsTable.id, item.id)).returning();
    return updated!;
  }
  await db.update(dealsTable).set({ etapa: "perdido", motivoPerda: input.justification.trim(), lostAt: now, vehicleReservationBlocked: false, updatedAt: now })
    .where(eq(dealsTable.id, item.dealId));
  await db.update(veiculosEstoqueTable).set({ status: "disponivel", updatedAt: now }).where(eq(veiculosEstoqueTable.id, item.vehicleId));
  await db.update(adCampaignsTable).set({ status: "ativo", updatedAt: now }).where(eq(adCampaignsTable.id, item.campaignId));
  const [updated] = await db.update(vehicleAdReservationsTable).set({
    status: "liberado", decision: "perdido", justification: input.justification.trim(),
    decidedBy: input.userId ?? null, decidedAt: now, updatedAt: now,
  }).where(eq(vehicleAdReservationsTable.id, item.id)).returning();
  return updated!;
}

export async function finalizeVehicleReservation(dealId: string, outcome: "ganho" | "perdido", justification?: string | null) {
  const [item] = await db.select().from(vehicleAdReservationsTable).where(and(
    eq(vehicleAdReservationsTable.dealId, dealId), inArray(vehicleAdReservationsTable.status, [...ACTIVE]),
  ));
  if (!item) return;
  const now = new Date();
  await db.update(vehicleAdReservationsTable).set({
    status: outcome === "ganho" ? "vendido" : "liberado", decision: outcome === "perdido" ? "perdido" : null,
    justification: justification ?? item.justification, decidedAt: now, updatedAt: now,
  }).where(eq(vehicleAdReservationsTable.id, item.id));
  await db.update(dealsTable).set({ vehicleReservationBlocked: false, updatedAt: now }).where(eq(dealsTable.id, dealId));
  await db.update(veiculosEstoqueTable).set({ status: outcome === "ganho" ? "vendido" : "disponivel", updatedAt: now })
    .where(eq(veiculosEstoqueTable.id, item.vehicleId));
  await db.update(adCampaignsTable).set({ status: outcome === "ganho" ? "encerrado" : "ativo", updatedAt: now })
    .where(eq(adCampaignsTable.id, item.campaignId));
}
