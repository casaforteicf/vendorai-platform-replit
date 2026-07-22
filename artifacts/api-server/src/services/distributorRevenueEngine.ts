import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  propostasTable,
  scoutOportunidadesTable,
  scoutRegrasTable,
  tenantsTable,
  type PropostaItem,
} from "@workspace/db";

export const DISTRIBUTOR_REVENUE_CONFIG = {
  "Distribuidora de Materiais de Construção": {
    reorderDays: 45,
    reactivationDays: 120,
    label: "materiais de construção",
  },
  "Distribuidora de Alimentos": {
    reorderDays: 14,
    reactivationDays: 45,
    label: "alimentos",
  },
  "Distribuidora de Máquinas e Insumos": {
    reorderDays: 90,
    reactivationDays: 180,
    label: "máquinas e insumos",
  },
} as const;

export type DistributorVertical = keyof typeof DISTRIBUTOR_REVENUE_CONFIG;

export function isDistributorVertical(vertical: string | null | undefined): vertical is DistributorVertical {
  return !!vertical && Object.prototype.hasOwnProperty.call(DISTRIBUTOR_REVENUE_CONFIG, vertical);
}

export interface DistributorPurchaseSnapshot {
  leadId: string;
  leadName?: string | null;
  dates: Date[];
  totals: number[];
  itemNames: string[];
}

export interface DistributorOpportunityCandidate {
  leadId: string;
  tipo: "recompra" | "reativacao";
  daysSincePurchase: number;
  estimatedValue: number;
  score: number;
  description: string;
  explanation: {
    facts: Record<string, unknown>;
    inference: Record<string, unknown>;
    autonomy: Record<string, unknown>;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildDistributorCandidate(
  vertical: DistributorVertical,
  snapshot: DistributorPurchaseSnapshot,
  now = new Date(),
): DistributorOpportunityCandidate | null {
  const config = DISTRIBUTOR_REVENUE_CONFIG[vertical];
  const dates = snapshot.dates.filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => b.getTime() - a.getTime());
  if (dates.length === 0) return null;

  const daysSincePurchase = Math.max(0, Math.floor((now.getTime() - dates[0]!.getTime()) / DAY_MS));
  if (daysSincePurchase < config.reorderDays) return null;

  const tipo = daysSincePurchase >= config.reactivationDays ? "reativacao" : "recompra";
  const threshold = tipo === "reativacao" ? config.reactivationDays : config.reorderDays;
  const urgency = Math.min(25, Math.floor(((daysSincePurchase - threshold) / Math.max(threshold, 1)) * 25));
  const score = Math.min(100, (tipo === "reativacao" ? 60 : 70) + Math.max(0, urgency));
  const validTotals = snapshot.totals.filter((value) => Number.isFinite(value) && value >= 0);
  const estimatedValue = validTotals.length
    ? Number((validTotals.reduce((sum, value) => sum + value, 0) / validTotals.length).toFixed(2))
    : 0;
  const products = [...new Set(snapshot.itemNames.filter(Boolean))].slice(0, 5);
  const leadLabel = snapshot.leadName?.trim() || snapshot.leadId;

  return {
    leadId: snapshot.leadId,
    tipo,
    daysSincePurchase,
    estimatedValue,
    score,
    description: tipo === "reativacao"
      ? `Reativar ${leadLabel}: ${daysSincePurchase} dias sem comprar ${config.label}`
      : `Sugerir recompra para ${leadLabel}: ciclo de ${config.label} vencido há ${daysSincePurchase - config.reorderDays} dias`,
    explanation: {
      facts: {
        vertical,
        lastAcceptedPurchaseAt: dates[0]!.toISOString(),
        daysSincePurchase,
        acceptedPurchases: dates.length,
        recentProducts: products,
        averageAcceptedOrderValue: estimatedValue,
      },
      inference: {
        signal: tipo,
        thresholdDays: threshold,
        rationale: tipo === "reativacao"
          ? "Cliente ultrapassou a janela de reativação configurada para o segmento."
          : "Cliente ultrapassou o ciclo de recompra configurado para o segmento.",
      },
      autonomy: {
        mode: "human_approval",
        automaticContact: false,
        requiredAction: "Revisar histórico, estoque e condição comercial antes do contato.",
      },
    },
  };
}

async function ensureSystemRule(tenantId: string, tipo: "recompra" | "reativacao", vertical: DistributorVertical) {
  const nome = `Revenue Scout · ${vertical} · ${tipo}`;
  const [existing] = await db
    .select()
    .from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.nome, nome)))
    .limit(1);
  if (existing) return existing;

  const config = DISTRIBUTOR_REVENUE_CONFIG[vertical];
  const [created] = await db.insert(scoutRegrasTable).values({
    tenantId,
    nome,
    tipo,
    condicoes: tipo === "recompra"
      ? { diasSemCompra: config.reorderDays, engine: "distributor_v1" }
      : { diasSemVisita: config.reactivationDays, engine: "distributor_v1" },
    acao: { canal: "human_approval", automaticContact: false },
    ativo: true,
  }).returning();
  return created!;
}

export async function runDistributorRevenueForTenant(
  tenantId: string,
  log: Logger,
): Promise<{ applicable: boolean; vertical?: DistributorVertical; customersAnalyzed: number; opportunitiesCreated: number }> {
  const [tenant] = await db
    .select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!isDistributorVertical(tenant?.vertical)) {
    return { applicable: false, customersAnalyzed: 0, opportunitiesCreated: 0 };
  }

  const vertical = tenant.vertical;
  const proposals = await db
    .select({
      leadId: propostasTable.leadId,
      acceptedAt: propostasTable.acceptedAt,
      updatedAt: propostasTable.updatedAt,
      valorTotal: propostasTable.valorTotal,
      itens: propostasTable.itens,
    })
    .from(propostasTable)
    .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.status, "aceita")))
    .orderBy(desc(propostasTable.acceptedAt));

  const leadIds = [...new Set(proposals.map((proposal) => proposal.leadId).filter((id): id is string => !!id))];
  const leads = leadIds.length
    ? await db.select({ id: leadsTable.id, nome: leadsTable.nome }).from(leadsTable).where(eq(leadsTable.tenantId, tenantId))
    : [];
  const leadNames = new Map(leads.map((lead) => [lead.id, lead.nome]));
  const snapshots = new Map<string, DistributorPurchaseSnapshot>();

  for (const proposal of proposals) {
    if (!proposal.leadId) continue;
    const snapshot = snapshots.get(proposal.leadId) ?? {
      leadId: proposal.leadId,
      leadName: leadNames.get(proposal.leadId),
      dates: [],
      totals: [],
      itemNames: [],
    };
    snapshot.dates.push(proposal.acceptedAt ?? proposal.updatedAt);
    snapshot.totals.push(Number(proposal.valorTotal ?? 0));
    snapshot.itemNames.push(...((proposal.itens ?? []) as PropostaItem[]).map((item) => item.nome));
    snapshots.set(proposal.leadId, snapshot);
  }

  const rules = {
    recompra: await ensureSystemRule(tenantId, "recompra", vertical),
    reativacao: await ensureSystemRule(tenantId, "reativacao", vertical),
  };
  let opportunitiesCreated = 0;

  for (const snapshot of snapshots.values()) {
    const candidate = buildDistributorCandidate(vertical, snapshot);
    if (!candidate) continue;
    const rule = rules[candidate.tipo];

    const existing = await db
      .select({ id: scoutOportunidadesTable.id, status: scoutOportunidadesTable.status })
      .from(scoutOportunidadesTable)
      .where(and(
        eq(scoutOportunidadesTable.tenantId, tenantId),
        eq(scoutOportunidadesTable.clienteId, candidate.leadId),
        eq(scoutOportunidadesTable.regraId, rule.id),
      ))
      .orderBy(desc(scoutOportunidadesTable.createdAt))
      .limit(1);

    if (existing[0] && !["ignorado", "converteu"].includes(existing[0].status ?? "")) continue;

    await db.insert(scoutOportunidadesTable).values({
      tenantId,
      clienteId: candidate.leadId,
      regraId: rule.id,
      tipo: candidate.tipo,
      descricao: candidate.description,
      valorEstimado: String(candidate.estimatedValue),
      status: "pendente_aprovacao",
      canal: "human_approval",
      scoreOportunidade: String(candidate.score),
      humanRequired: true,
      blocked: false,
      explanation: candidate.explanation,
    });
    opportunitiesCreated += 1;
  }

  log.info({ tenantId, vertical, customersAnalyzed: snapshots.size, opportunitiesCreated }, "distributor-scout: concluído");
  return { applicable: true, vertical, customersAnalyzed: snapshots.size, opportunitiesCreated };
}
