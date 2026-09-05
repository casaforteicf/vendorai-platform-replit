export type SignalDomain = "revenue" | "marketing" | "sales" | "finance" | "operations" | "service";

export interface BusinessSignal<TPayload = Record<string, unknown>> {
  id: string;
  tenantId: string;
  type: string;
  domain: SignalDomain;
  occurredAt: string;
  payload: TPayload;
  confidence?: number;
  source?: string;
}

export type OpportunityTarget = "sales" | "marketing" | "finance" | "operations" | "support";

export interface RoutedOpportunity {
  tenantId: string;
  signalId: string;
  signalType: string;
  target: OpportunityTarget;
  opportunityType: string;
  recommendedAction: string;
  priority: "low" | "medium" | "high" | "critical";
  reason: string;
}

const MARKETING_SIGNAL_ROUTES: Record<string, Pick<RoutedOpportunity, "target" | "opportunityType" | "recommendedAction">> = {
  "customer.repurchase_window": { target: "marketing", opportunityType: "repurchase", recommendedAction: "prepare-campaign" },
  "customer.inactive": { target: "marketing", opportunityType: "reactivation", recommendedAction: "prepare-reactivation" },
  "product.stock_excess": { target: "marketing", opportunityType: "inventory-activation", recommendedAction: "prepare-campaign" },
  "region.sales_growth": { target: "marketing", opportunityType: "regional-growth", recommendedAction: "prepare-regional-campaign" },
  "campaign.performance_drop": { target: "marketing", opportunityType: "campaign-optimization", recommendedAction: "review-campaign" },
};

const SALES_SIGNAL_ROUTES: Record<string, Pick<RoutedOpportunity, "target" | "opportunityType" | "recommendedAction">> = {
  "lead.stalled": { target: "sales", opportunityType: "stalled-lead", recommendedAction: "create-follow-up" },
  "proposal.stalled": { target: "sales", opportunityType: "stalled-proposal", recommendedAction: "create-follow-up" },
};

export function routeSignal(signal: BusinessSignal): RoutedOpportunity | null {
  const route = MARKETING_SIGNAL_ROUTES[signal.type] ?? SALES_SIGNAL_ROUTES[signal.type];
  if (!route) return null;

  const confidence = signal.confidence ?? 0.7;
  const priority: RoutedOpportunity["priority"] =
    confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low";

  return {
    tenantId: signal.tenantId,
    signalId: signal.id,
    signalType: signal.type,
    target: route.target,
    opportunityType: route.opportunityType,
    recommendedAction: route.recommendedAction,
    priority,
    reason: `Signal ${signal.type} routed from ${signal.source ?? signal.domain} with confidence ${confidence.toFixed(2)}.`,
  };
}

export function routeSignals(signals: BusinessSignal[]): RoutedOpportunity[] {
  return signals.map(routeSignal).filter((item): item is RoutedOpportunity => Boolean(item));
}
