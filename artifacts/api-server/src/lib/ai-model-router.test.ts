import { afterEach, describe, expect, it } from "vitest";
import {
  aiRouterV2Enabled,
  isModernReasoningModel,
  reasoningEffortForFeature,
  resolveImageModel,
  resolveTextModel,
  textTierForFeature,
} from "./ai-model-router.js";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("VendorAI AI model router V2", () => {
  it("keeps production on the legacy model while the rollout flag is disabled", () => {
    delete process.env["VENDORAI_AI_ROUTER_V2"];
    expect(aiRouterV2Enabled("tenant-internal")).toBe(false);
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-internal" })).toBe("gpt-4o-mini");
  });

  it("routes complex site and intelligence work to Astra when enabled", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-internal" })).toBe("gpt-6-astra");
    expect(resolveTextModel({ feature: "intelligence_analysis", tenantId: "tenant-internal" })).toBe("gpt-6-astra");
    expect(reasoningEffortForFeature("intelligence_analysis")).toBe("high");
  });

  it("fails closed for tenants outside the rollout allowlist", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(aiRouterV2Enabled("tenant-customer")).toBe(false);
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-customer" })).toBe("gpt-4o-mini");
  });

  it("uses Sol, Terra and Luna according to workload", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(textTierForFeature("content_generator")).toBe("sol");
    expect(textTierForFeature("agent_sdr")).toBe("terra");
    expect(textTierForFeature("document_extraction")).toBe("luna");
  });

  it("always preserves a model explicitly requested by a caller", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(resolveTextModel({
      feature: "site_generator",
      tenantId: "tenant-internal",
      requestedModel: "tenant-approved-model",
    })).toBe("tenant-approved-model");
  });

  it("allows model aliases to be changed without a code deployment", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    process.env["VENDORAI_MODEL_ASTRA"] = "future-astra-snapshot";
    process.env["VENDORAI_IMAGE_MODEL_PREMIUM"] = "premium-image-snapshot";
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-internal" })).toBe("future-astra-snapshot");
    expect(resolveImageModel("premium")).toBe("premium-image-snapshot");
  });

  it("identifies models that must not receive legacy sampling parameters", () => {
    expect(isModernReasoningModel("gpt-6-astra")).toBe(true);
    expect(isModernReasoningModel("gpt-5.6-terra")).toBe(true);
    expect(isModernReasoningModel("gpt-4o-mini")).toBe(false);
  });
});
