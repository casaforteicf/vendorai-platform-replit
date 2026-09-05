import type { BusinessSignal } from './intelligence-routing';
import { resolveMarketingSignalDecision } from './marketing-runtime';

export type RevenueScoutSignalKind =
  | 'recompra'
  | 'reativacao'
  | 'cross_sell'
  | 'upgrade'
  | 'aniversario'
  | 'sequencia_produto';

export interface RevenueScoutOpportunityLike {
  id: string;
  tenantId: string;
  type?: string | null;
  tipo?: string | null;
  score?: number | null;
  confidence?: number | null;
  customerId?: string | null;
  clienteId?: string | null;
  productId?: string | null;
  produtoId?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

const SIGNAL_TYPES: Record<RevenueScoutSignalKind, string> = {
  recompra: 'customer.repurchase_window',
  reativacao: 'customer.inactive',
  cross_sell: 'customer.cross_sell',
  upgrade: 'customer.upgrade',
  aniversario: 'customer.anniversary',
  sequencia_produto: 'customer.product_sequence',
};

function normalizeScoutType(input?: string | null): RevenueScoutSignalKind | null {
  const normalized = (input ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'reativação') return 'reativacao';
  if (normalized === 'crosssell') return 'cross_sell';
  if (normalized in SIGNAL_TYPES) return normalized as RevenueScoutSignalKind;
  return null;
}

export function revenueScoutOpportunityToSignal(input: RevenueScoutOpportunityLike): BusinessSignal {
  const scoutType = normalizeScoutType(input.type ?? input.tipo);
  const confidence = input.confidence ?? (typeof input.score === 'number' ? Math.max(0, Math.min(1, input.score > 1 ? input.score / 100 : input.score)) : 0.75);

  return {
    id: `revenue-scout:${input.id}`,
    tenantId: input.tenantId,
    type: scoutType ? SIGNAL_TYPES[scoutType] : 'revenue.opportunity',
    domain: 'revenue',
    occurredAt: input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
    confidence,
    source: 'revenue-scout',
    payload: {
      revenueScoutOpportunityId: input.id,
      revenueScoutType: scoutType ?? input.type ?? input.tipo ?? 'unknown',
      customerId: input.customerId ?? input.clienteId ?? null,
      productId: input.productId ?? input.produtoId ?? null,
      ...(input.payload ?? {}),
    },
  };
}

/**
 * Adapter only: it does not persist signals/opportunities. Revenue Scout remains
 * canonical and the shared intelligence layer decides which specialist should act.
 */
export function resolveRevenueScoutDecision(input: RevenueScoutOpportunityLike) {
  return resolveMarketingSignalDecision(revenueScoutOpportunityToSignal(input));
}
