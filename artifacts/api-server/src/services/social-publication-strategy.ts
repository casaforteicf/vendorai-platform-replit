export type SocialPublicationExecutionMode =
  | "vendorai_native_meta_graph"
  | "provider_connector";

export type SocialPublicationAnalyticsMode =
  | "windsor"
  | "native";

export type SocialPublicationStrategy = {
  executionMode: SocialPublicationExecutionMode;
  analyticsMode: SocialPublicationAnalyticsMode;
  transport: string;
};

/**
 * Source of truth for social publishing ownership.
 *
 * Instagram is always executed by VendorAI directly through Meta/Instagram
 * Graph API. Windsor is analytics-only and must never become the publishing
 * transport for Instagram.
 */
export function resolveSocialPublicationStrategy(provider: string): SocialPublicationStrategy {
  if (provider === "instagram") {
    return {
      executionMode: "vendorai_native_meta_graph",
      analyticsMode: "windsor",
      transport: "meta_instagram_graph_api",
    };
  }

  return {
    executionMode: "provider_connector",
    analyticsMode: "native",
    transport: "provider_connector",
  };
}
