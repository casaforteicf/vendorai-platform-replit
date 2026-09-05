import { resolveMarketingAgentPlan, type MarketingAgentRuntimeContext } from './marketing-agent';
import { validateCreativeBrief, type CreativeBrief } from './creative-design';
import { routeSignal, type BusinessSignal, type RoutedOpportunity } from './intelligence-routing';

export interface MarketingCampaignContextInput {
  tenantId: string;
  verticalId?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  page?: string | null;
  objective?: string | null;
  audience?: string | null;
  productIds?: string[];
  productNames?: string[];
  selectedChannels?: MarketingAgentRuntimeContext['selectedChannels'];
}

export interface MarketingRuntimeResolution {
  agentPlan: ReturnType<typeof resolveMarketingAgentPlan>;
  creativeBrief?: CreativeBrief;
  creativeBriefErrors: string[];
}

/**
 * Official bridge from the existing MarketingContextSelector / Campaign context
 * into the Marketing Agent runtime. It intentionally does not persist anything:
 * Campaign remains the source of truth and existing marketing modules own writes.
 */
export function resolveMarketingRuntime(
  input: MarketingCampaignContextInput,
  creative?: Partial<CreativeBrief>,
): MarketingRuntimeResolution {
  const agentPlan = resolveMarketingAgentPlan({
    tenantId: input.tenantId,
    verticalId: input.verticalId ?? undefined,
    page: input.page ?? undefined,
    campaignId: input.campaignId ?? undefined,
    objective: input.objective ?? undefined,
    audience: input.audience ?? undefined,
    productId: input.productIds?.[0],
    selectedChannels: input.selectedChannels,
  });

  if (!creative) {
    return { agentPlan, creativeBriefErrors: [] };
  }

  const creativeBrief: CreativeBrief = {
    tenantId: input.tenantId,
    campaignId: input.campaignId ?? null,
    objective: creative.objective ?? input.objective ?? '',
    audience: creative.audience ?? input.audience ?? null,
    productId: creative.productId ?? input.productIds?.[0] ?? null,
    offer: creative.offer ?? null,
    channel: creative.channel ?? input.selectedChannels?.[0] ?? '',
    format: creative.format ?? '',
    message: creative.message ?? null,
    cta: creative.cta ?? null,
    visualDirection: creative.visualDirection ?? null,
    assetIds: creative.assetIds ?? [],
  };

  return {
    agentPlan,
    creativeBrief,
    creativeBriefErrors: validateCreativeBrief(creativeBrief),
  };
}

export interface MarketingSignalDecision {
  signal: BusinessSignal;
  opportunity: RoutedOpportunity | null;
  shouldNotifyMarketingAgent: boolean;
}

/**
 * Normalizes intelligence output into an agent-facing decision without creating
 * another opportunity store. Existing Revenue Scout / Campaign stores remain canonical.
 */
export function resolveMarketingSignalDecision(signal: BusinessSignal): MarketingSignalDecision {
  const opportunity = routeSignal(signal);
  return {
    signal,
    opportunity,
    shouldNotifyMarketingAgent: opportunity?.target === 'marketing',
  };
}
