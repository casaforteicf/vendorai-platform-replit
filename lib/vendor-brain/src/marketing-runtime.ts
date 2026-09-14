import { resolveMarketingAgentPlan, type MarketingAgentRuntimeContext } from './marketing-agent';
import { validateCreativeBrief, type CreativeBrief } from './creative-design';
import { routeSignal, type BusinessSignal, type RoutedOpportunity } from './intelligence-routing';
import {
  deriveMarketingPriorities,
  type MarketingAutomationMode,
  type MarketingPriority,
  type NormalizedMarketingRecord,
} from './marketing-data-standard';
import { buildInstagramGrowthIntelligence, type InstagramGrowthIntelligence } from './instagram-growth';

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

export interface MarketingDataIntelligenceResolution {
  tenantId: string;
  automationMode: MarketingAutomationMode;
  priorities: MarketingPriority[];
  recordCount: number;
  instagramGrowth?: InstagramGrowthIntelligence;
}

/**
 * Canonical bridge from normalized Windsor/native marketing data into Tad.
 * Keeps provider-specific schemas outside the agent/runtime and enforces that
 * every record belongs to the requested tenant before intelligence is derived.
 * Instagram has a permanent growth-first objective: reach -> retention ->
 * engagement -> follower conversion -> commercial conversion.
 */
export function resolveMarketingDataIntelligence(input: {
  tenantId: string;
  records: NormalizedMarketingRecord[];
  automationMode?: MarketingAutomationMode;
}): MarketingDataIntelligenceResolution {
  const records = input.records.filter((record) => record.provenance.tenantId === input.tenantId);
  const automationMode = input.automationMode ?? 'RECOMMEND';
  const instagramRecords = records.filter((record) => record.provenance.connector === 'instagram');

  return {
    tenantId: input.tenantId,
    automationMode,
    priorities: deriveMarketingPriorities(records, automationMode),
    recordCount: records.length,
    instagramGrowth: instagramRecords.length
      ? buildInstagramGrowthIntelligence({ records: instagramRecords, automationMode })
      : undefined,
  };
}
