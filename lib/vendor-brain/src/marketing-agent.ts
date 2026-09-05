import {
  AGENT_REGISTRY,
  CHANNEL_REGISTRY,
  DEFAULT_MARKETING_AGENT_AUTONOMY,
  SKILL_REGISTRY,
  type ChannelId,
  type MarketingAgentAutonomy,
  type MarketingAgentContext,
  type SkillId,
} from "./platform-foundation";
import { getVerticalBlueprint } from "./vertical-blueprint";

export interface MarketingAgentRuntimeContext extends MarketingAgentContext {
  objective?: string | null;
  audience?: string | null;
  productId?: string | null;
  selectedChannels?: ChannelId[];
  autonomy?: Partial<MarketingAgentAutonomy>;
}

export interface MarketingAgentPlan {
  agentId: "marketing";
  context: MarketingAgentRuntimeContext;
  skills: SkillId[];
  channels: ChannelId[];
  autonomy: MarketingAgentAutonomy;
  guardrails: string[];
}

const DEFAULT_MARKETING_CHANNELS: ChannelId[] = ["meta", "instagram", "google-search", "whatsapp", "email"];
const dedupe = <T,>(values: T[]): T[] => [...new Set(values)];
const isChannelId = (value: string): value is ChannelId => value in CHANNEL_REGISTRY;
const isSkillId = (value: string): value is SkillId => value in SKILL_REGISTRY;

export function resolveMarketingAgentPlan(context: MarketingAgentRuntimeContext): MarketingAgentPlan {
  const agent = AGENT_REGISTRY.marketing;
  const vertical = context.verticalId ? getVerticalBlueprint(context.verticalId) : undefined;
  const recommendedChannels = (vertical?.marketing.recommendedChannels ?? DEFAULT_MARKETING_CHANNELS).filter(isChannelId);
  const channels: ChannelId[] = dedupe(
    context.selectedChannels?.length ? context.selectedChannels : recommendedChannels,
  );

  const channelSkills: SkillId[] = channels.flatMap((channel) => CHANNEL_REGISTRY[channel].skillIds);
  const verticalSkills = (vertical?.marketing.skillIds ?? []).filter(isSkillId);
  const skills: SkillId[] = dedupe<SkillId>([...agent.skillIds, ...verticalSkills, ...channelSkills]).filter(isSkillId);

  const autonomy: MarketingAgentAutonomy = {
    ...DEFAULT_MARKETING_AGENT_AUTONOMY,
    ...(context.autonomy ?? {}),
  };

  return {
    agentId: "marketing",
    context,
    skills,
    channels,
    autonomy,
    guardrails: [
      "Use official VendorAI modules and tools; never create parallel campaign, media, site or analytics stores.",
      "Treat the Marketing Planner as the strategic source and Campaign as the execution spine.",
      "Adapt campaign execution to each channel; do not merely resize or duplicate the same creative.",
      "Use tenant brand context before generating or approving creative assets.",
      "Require explicit permission before publishing ads, changing budget or pausing paid campaigns.",
      "Keep tenant context isolated and never reuse private learning across tenants.",
    ],
  };
}

export function getMarketingContextDescription(context: MarketingAgentRuntimeContext): string {
  const parts = [
    context.verticalId ? `vertical=${context.verticalId}` : null,
    context.tenantId ? `tenant=${context.tenantId}` : null,
    context.page ? `page=${context.page}` : null,
    context.campaignId ? `campaign=${context.campaignId}` : null,
    context.entityType && context.entityId ? `${context.entityType}=${context.entityId}` : null,
  ].filter(Boolean);

  return parts.join(" | ");
}
