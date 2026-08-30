/**
 * Generaliza "pausar campanha ao interesse + prazo do vendedor pra
 * atualizar" pra qualquer campanha "Modo: Só este item" -- achado real
 * (Marcos): essa lógica já existia funcionando de verdade só pra veículos
 * (vehicle-reservation.ts), mesmo os campos que ela usa (pausarAoInteresse,
 * slaNegociacaoHoras) já sendo genéricos na tabela de campanha.
 *
 * Aditivo, não mexe em nada do fluxo de veículo já em produção -- tabela
 * própria (item_ad_reservations), serviço próprio. Cobre:
 * - imóvel: reserva de verdade (marca status "reservado" em
 *   imoveis_propriedades, igual veículo faz em veiculos_estoque)
 * - produto/landing_page/livre: pausa a campanha + cria o prazo pro
 *   vendedor + notifica, mas SEM reservar estoque (não existe conceito
 *   de "reservado" nesses catálogos -- produto é vendido por quantidade,
 *   não por unidade única)
 */
import { and, eq, inArray, lte } from "drizzle-orm";
import {
  db, adCampaignsTable, dealsTable, leadsTable, notificationsTable,
  itemAdReservationsTable, imoveisPropriedadesTable, produtosCatalogoTable,
} from "@workspace/db";

const ACTIVE = ["em_negociacao", "justificativa_pendente"] as const;

// itemTipo que têm um conceito real de "reservar" (campo de status no
// próprio catálogo do item) -- os outros só pausam+notificam, sem
// reservar estoque.
const TIPOS_COM_RESERVA_DE_ESTOQUE = ["imovel"] as const;

async function marcarItemReservado(itemTipo: string, itemId: string, tenantId: string) {
  if (itemTipo === "imovel") {
    await db.update(imoveisPropriedadesTable).set({ status: "reservado", updatedAt: new Date() })
      .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
  }
  // produto/landing_page/livre: sem campo de status pra reservar --
  // pausar a campanha já é o efeito prático desejado.
}

async function liberarItem(itemTipo: string, itemId: string, tenantId: string) {
  if (itemTipo === "imovel") {
    await db.update(imoveisPropriedadesTable).set({ status: "disponivel", updatedAt: new Date() })
      .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
  }
}

async function marcarItemVendido(itemTipo: string, itemId: string, tenantId: string) {
  if (itemTipo === "imovel") {
    const [imovel] = await db.select({ finalidade: imoveisPropriedadesTable.finalidade }).from(imoveisPropriedadesTable)
      .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
    await db.update(imoveisPropriedadesTable).set({ status: imovel?.finalidade === "aluguel" ? "alugado" : "vendido", updatedAt: new Date() })
      .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
  }
}

async function nomeDoItem(itemTipo: string, itemId: string, tenantId: string): Promise<string> {
  if (itemTipo === "imovel") {
    const [imovel] = await db.select({ titulo: imoveisPropriedadesTable.titulo }).from(imoveisPropriedadesTable)
      .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
    return imovel?.titulo ?? "Imóvel";
  }
  if (itemTipo === "produto") {
    const [produto] = await db.select({ nome: produtosCatalogoTable.nome }).from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.id, itemId), eq(produtosCatalogoTable.tenantId, tenantId)));
    return produto?.nome ?? "Produto";
  }
  return "Item anunciado";
}

export class ItemReservationError extends Error {}

export async function reserveUniqueItem(input: {
  tenantId: string; campaignId: string; leadId: string; sellerId?: string | null;
}) {
  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, input.campaignId), eq(adCampaignsTable.tenantId, input.tenantId),
  ));
  if (!campaign || campaign.modo !== "unico" || !campaign.itemId || campaign.itemTipo === "veiculo") {
    // Veículo continua exclusivamente no fluxo antigo (vehicle-reservation.ts)
    // -- não duplica aqui.
    throw new ItemReservationError("Campanha não elegível para reserva genérica");
  }
  const [lead] = await db.select().from(leadsTable).where(and(
    eq(leadsTable.id, input.leadId), eq(leadsTable.tenantId, input.tenantId),
  ));
  if (!lead) throw new ItemReservationError("Lead não encontrado");

  const [busy] = await db.select().from(itemAdReservationsTable).where(and(
    eq(itemAdReservationsTable.itemTipo, campaign.itemTipo),
    eq(itemAdReservationsTable.itemId, campaign.itemId),
    inArray(itemAdReservationsTable.status, [...ACTIVE]),
  ));
  if (busy) {
    if (busy.leadId === lead.id) return busy;
    throw new ItemReservationError("Este item já está reservado para outro lead");
  }

  const itemNome = await nomeDoItem(campaign.itemTipo, campaign.itemId, input.tenantId);
  const sellerId = input.sellerId ?? campaign.responsavelId ?? lead.assignedTo ?? null;
  const due = new Date(Date.now() + Math.max(1, campaign.slaNegociacaoHoras) * 3_600_000);

  let [deal] = await db.select().from(dealsTable).where(and(
    eq(dealsTable.tenantId, input.tenantId), eq(dealsTable.leadId, lead.id),
    inArray(dealsTable.etapa, ["em_aquecimento", "novo", "qualificado", "proposta", "negociacao"]),
  )).limit(1);
  if (!deal) {
    [deal] = await db.insert(dealsTable).values({
      tenantId: input.tenantId, leadId: lead.id,
      titulo: `${itemNome} — ${lead.nome}`,
      etapa: "negociacao", assignedTo: sellerId, vehicleReservationDueAt: due,
    }).returning();
  } else {
    [deal] = await db.update(dealsTable).set({ etapa: "negociacao", assignedTo: sellerId, vehicleReservationDueAt: due, vehicleReservationBlocked: false, updatedAt: new Date() })
      .where(eq(dealsTable.id, deal.id)).returning();
  }

  const [reservation] = await db.insert(itemAdReservationsTable).values({
    tenantId: input.tenantId, campaignId: campaign.id, itemTipo: campaign.itemTipo, itemId: campaign.itemId,
    leadId: lead.id, dealId: deal!.id, sellerId, justificationDueAt: due,
  }).returning();
  await db.update(leadsTable).set({ adCampaignId: campaign.id, assignedTo: sellerId, updatedAt: new Date() })
    .where(eq(leadsTable.id, lead.id));

  if (TIPOS_COM_RESERVA_DE_ESTOQUE.includes(campaign.itemTipo as any)) {
    await marcarItemReservado(campaign.itemTipo, campaign.itemId, input.tenantId);
  }
  if (campaign.pausarAoInteresse) {
    await db.update(adCampaignsTable).set({ status: "pausado", updatedAt: new Date() })
      .where(eq(adCampaignsTable.id, campaign.id));
  }
  await db.insert(notificationsTable).values({
    tenantId: input.tenantId, type: "info", category: "item_reservation",
    title: "Item reservado e anúncio pausado",
    message: `${itemNome} foi reservado para ${lead.nome}. O vendedor tem até ${due.toLocaleString("pt-BR")} para atualizar a negociação.`,
  });
  return reservation!;
}

export async function markOverdueItemReservations() {
  const overdue = await db.select().from(itemAdReservationsTable).where(and(
    eq(itemAdReservationsTable.status, "em_negociacao"),
    lte(itemAdReservationsTable.justificationDueAt, new Date()),
  ));
  for (const item of overdue) {
    await db.update(itemAdReservationsTable).set({ status: "justificativa_pendente", updatedAt: new Date() })
      .where(eq(itemAdReservationsTable.id, item.id));
    await db.update(dealsTable).set({ vehicleReservationBlocked: true, updatedAt: new Date() })
      .where(eq(dealsTable.id, item.dealId));
    await db.insert(notificationsTable).values({
      tenantId: item.tenantId, type: "warning", category: "item_reservation_sla",
      title: "Negociação exige justificativa",
      message: "O prazo combinado venceu. Justifique para manter, avançar ou marcar a oportunidade como perdida.",
    });
  }
  return overdue.length;
}

export async function decideItemReservation(input: {
  tenantId: string; reservationId: string; userId?: string | null;
  decision: "manter" | "avancar" | "perdido"; justification: string;
}) {
  if (input.justification.trim().length < 10) throw new ItemReservationError("Informe uma justificativa com pelo menos 10 caracteres");
  const [item] = await db.select().from(itemAdReservationsTable).where(and(
    eq(itemAdReservationsTable.id, input.reservationId), eq(itemAdReservationsTable.tenantId, input.tenantId),
    inArray(itemAdReservationsTable.status, [...ACTIVE]),
  ));
  if (!item) throw new ItemReservationError("Reserva ativa não encontrada");
  const now = new Date();
  if (input.decision === "manter" || input.decision === "avancar") {
    const nextDue = new Date(now.getTime() + 48 * 3_600_000);
    const novaEtapa = input.decision === "avancar" ? "proposta" : undefined;
    await db.update(dealsTable).set({
      ...(novaEtapa ? { etapa: novaEtapa } : {}),
      vehicleReservationBlocked: false, vehicleReservationDueAt: nextDue, updatedAt: now,
    }).where(eq(dealsTable.id, item.dealId));
    const [updated] = await db.update(itemAdReservationsTable).set({
      status: "em_negociacao", decision: input.decision, justification: input.justification.trim(),
      decidedBy: input.userId ?? null, decidedAt: now, justificationDueAt: nextDue, updatedAt: now,
    }).where(eq(itemAdReservationsTable.id, item.id)).returning();
    return updated!;
  }
  await db.update(dealsTable).set({ etapa: "perdido", motivoPerda: input.justification.trim(), lostAt: now, vehicleReservationBlocked: false, updatedAt: now })
    .where(eq(dealsTable.id, item.dealId));
  await liberarItem(item.itemTipo, item.itemId, input.tenantId);
  await db.update(adCampaignsTable).set({ status: "ativo", updatedAt: now }).where(eq(adCampaignsTable.id, item.campaignId));
  const [updated] = await db.update(itemAdReservationsTable).set({
    status: "liberado", decision: "perdido", justification: input.justification.trim(),
    decidedBy: input.userId ?? null, decidedAt: now, updatedAt: now,
  }).where(eq(itemAdReservationsTable.id, item.id)).returning();
  return updated!;
}

export async function finalizeItemReservation(dealId: string, outcome: "ganho" | "perdido", justification?: string | null) {
  const [item] = await db.select().from(itemAdReservationsTable).where(and(
    eq(itemAdReservationsTable.dealId, dealId), inArray(itemAdReservationsTable.status, [...ACTIVE]),
  ));
  if (!item) return;
  const now = new Date();
  await db.update(itemAdReservationsTable).set({
    status: outcome === "ganho" ? "vendido" : "liberado", decision: outcome === "perdido" ? "perdido" : null,
    justification: justification ?? item.justification, decidedAt: now, updatedAt: now,
  }).where(eq(itemAdReservationsTable.id, item.id));
  await db.update(dealsTable).set({ vehicleReservationBlocked: false, updatedAt: now }).where(eq(dealsTable.id, dealId));
  if (outcome === "ganho") {
    await marcarItemVendido(item.itemTipo, item.itemId, item.tenantId);
  } else {
    await liberarItem(item.itemTipo, item.itemId, item.tenantId);
  }
  await db.update(adCampaignsTable).set({ status: outcome === "ganho" ? "encerrado" : "ativo", updatedAt: now })
    .where(eq(adCampaignsTable.id, item.campaignId));
}
