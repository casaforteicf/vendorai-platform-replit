import type { AiFeature } from "@workspace/db";

export type VendorAITextTier = "astra" | "sol" | "terra" | "luna";
export type VendorAIImageTier = "premium" | "fast";
export type VendorAIReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

const CHAT_FEATURES = new Set<AiFeature>([
  "agent_sdr",
  "agent_closer",
  "agent_followup",
  "agent_reactivation",
  "agent_scheduler",
  "agent_service",
  "agent_onboarding",
  "agent_relacionamento",
  "agent_financeiro",
  "agent_cobranca",
]);

// Premium creation is intentionally routed to the strongest reasoning tier.
// Campaigns and ads currently enter through briefing/content generation, while
// site_generator covers both full sites and landing pages. image_generator is
// included for prompt/direction work; final pixels still use the image router.
const PREMIUM_CREATIVE_FEATURES = new Set<AiFeature>([
  "site_generator",
  "content_generator",
  "image_generator",
  "intelligence_analysis",
  "briefing_generator",
  "spin_briefing",
]);

const PROFESSIONAL_FEATURES = new Set<AiFeature>([
  "proposal_generator",
  "media_interpretation",
  "auto_quote",
  "churn_retention",
]);

function configured(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function enabledTenantIds(): Set<string> {
  return new Set(
    (process.env["VENDORAI_AI_ROUTER_TENANTS"] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function aiRouterV2Enabled(tenantId?: string): boolean {
  if (process.env["VENDORAI_AI_ROUTER_V2"]?.trim().toLowerCase() !== "true") return false;

  const allowlist = enabledTenantIds();
  // An empty allowlist is intentionally fail-closed.
  return Boolean(tenantId && (allowlist.has(tenantId) || allowlist.has("*")));
}

export function textTierForFeature(feature: AiFeature): VendorAITextTier {
  // All conversational agents use Luna so the chat experience has one fast,
  // predictable and low-cost default model across every tenant.
  if (CHAT_FEATURES.has(feature)) return "luna";
  if (PREMIUM_CREATIVE_FEATURES.has(feature)) return "astra";
  if (PROFESSIONAL_FEATURES.has(feature)) return "sol";
  if (feature === "document_extraction" || feature === "embedding" || feature === "audio_transcription") {
    return "luna";
  }
  return "terra";
}

export function modelForTextTier(tier: VendorAITextTier): string {
  if (tier === "astra") return configured("VENDORAI_MODEL_ASTRA", "gpt-6-astra");
  if (tier === "sol") return configured("VENDORAI_MODEL_SOL", "gpt-5.6-sol");
  if (tier === "terra") return configured("VENDORAI_MODEL_TERRA", "gpt-5.6-terra");
  return configured("VENDORAI_MODEL_LUNA", "gpt-5.6-luna");
}

export function resolveTextModel(params: {
  feature: AiFeature;
  tenantId?: string;
  requestedModel?: string;
  legacyDefault?: string;
}): string {
  // Chat traffic is intentionally standardized on Luna. This also overrides
  // older callers that still explicitly request gpt-4o-mini.
  if (CHAT_FEATURES.has(params.feature)) return modelForTextTier("luna");

  // Non-chat features may still select a model explicitly.
  if (params.requestedModel?.trim()) return params.requestedModel.trim();

  // Safe rollout: production behavior remains unchanged until the flag is enabled.
  if (!aiRouterV2Enabled(params.tenantId)) return params.legacyDefault ?? "gpt-4o-mini";

  return modelForTextTier(textTierForFeature(params.feature));
}

export function reasoningEffortForFeature(feature: AiFeature): VendorAIReasoningEffort {
  if (PREMIUM_CREATIVE_FEATURES.has(feature)) return "high";
  if (PROFESSIONAL_FEATURES.has(feature)) return "medium";
  return "low";
}

export function isModernReasoningModel(model: string): boolean {
  return /^(gpt-[56](?:\.|-|$)|o[1-9](?:-|$))/i.test(model.trim());
}

export function resolveImageModel(tier: VendorAIImageTier): string {
  return tier === "premium"
    ? configured("VENDORAI_IMAGE_MODEL_PREMIUM", "gpt-image-2")
    : configured("VENDORAI_IMAGE_MODEL_FAST", "gpt-image-1-mini");
}

export const AI_ORCHESTRATOR_POLICY = Object.freeze({
  version: "2.2",
  text: {
    chat: "gpt-5.6-luna",
    premiumCreative: "gpt-6-astra",
    professional: "gpt-5.6-sol",
    operational: "gpt-5.6-terra",
    highVolume: "gpt-5.6-luna",
  },
  premiumCreative: {
    campaign: "gpt-6-astra",
    ads: "gpt-6-astra",
    site: "gpt-6-astra",
    landingPage: "gpt-6-astra",
    content: "gpt-6-astra",
    videoDirector: "gpt-6-astra",
    renderDirector: "gpt-6-astra",
  },
  image: {
    premium: "gpt-image-2",
    fast: "gpt-image-1-mini",
  },
  video: {
    director: "gpt-6-astra",
    composer: "vendorai-media-workspace",
  },
  rollout: "feature-flag",
} as const);
