import { describe, expect, it } from "vitest";
import { resolveSocialPublicationStrategy } from "./social-publication-strategy.js";

describe("social publication strategy", () => {
  it("keeps Instagram publishing native to VendorAI and Windsor analytics-only", () => {
    expect(resolveSocialPublicationStrategy("instagram")).toEqual({
      executionMode: "vendorai_native_meta_graph",
      analyticsMode: "windsor",
      transport: "meta_instagram_graph_api",
    });
  });

  it("keeps other providers on their existing connector strategy", () => {
    expect(resolveSocialPublicationStrategy("linkedin")).toEqual({
      executionMode: "provider_connector",
      analyticsMode: "native",
      transport: "provider_connector",
    });
  });
});
