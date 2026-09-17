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
  it("keeps non-chat production traffic on the legacy model while the rollout flag is disabled", () => {
    delete process.env["VENDORAI_AI_ROUTER_V2"];
    expect(aiRouterV2Enabled("tenant-internal")).toBe(false);
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-internal" })).toBe("gpt-4o-mini");
  });

  it("standardizes every conversational agent on Luna even before the general rollout flag", () => {
    delete process.env["VENDORAI_AI_ROUTER_V2"];
    const chatFeatures = [
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
    ] as const;

    for (const feature of chatFeatures) {
      expect(textTierForFeature(feature)).toBe("luna");
      expect(resolveTextModel({ feature, tenantId: "tenant-customer" })).toBe("gpt-5.6-luna");
    }
  });

  it("overrides legacy explicit chat model selections so old callers also use Luna", () => {
    expect(resolveTextModel({
      feature: "agent_sdr",
      tenantId: "tenant-internal",
      requestedModel: "gpt-4o-mini",
    })).toBe("gpt-5.6-luna");
  });

  it("routes complex site and intelligence work to Astra when enabled", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-internal" })).toBe("gpt-6-astra");
    expect(resolveTextModel({ feature: "intelligence_analysis", tenantId: "tenant-internal" })).toBe("gpt-6-astra");
    expect(reasoningEffortForFeature("intelligence_analysis")).toBe("high");
  });

  it("fails closed for non-chat tenants outside the rollout allowlist", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(aiRouterV2Enabled("tenant-customer")).toBe(false);
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-customer" })).toBe("gpt-4o-mini");
  });

  it("uses Sol and Luna according to workload", () => {
    process.env["VENDORAI_AI_ROUTER_V2"] = "true";
    process.env["VENDORAI_AI_ROUTER_TENANTS"] = "tenant-internal";
    expect(textTierForFeature("content_generator")).toBe("sol");
    expect(textTierForFeature("agent_sdr")).toBe("luna");
    expect(textTierForFeature("document_extraction")).toBe("luna");
  });

  it("preserves an explicitly requested model for non-chat features", () => {
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
    process.env["VENDORAI_MODEL_LUNA"] = "future-luna-snapshot";
    process.env["VENDORAI_IMAGE_MODEL_PREMIUM"] = "premium-image-snapshot";
    expect(resolveTextModel({ feature: "site_generator", tenantId: "tenant-internal" })).toBe("future-astra-snapshot");
    expect(resolveTextModel({ feature: "agent_service", tenantId: "tenant-internal" })).toBe("future-luna-snapshot");
    expect(resolveImageModel("premium")).toBe("premium-image-snapshot");
  });

  it("identifies models that must not receive legacy sampling parameters", () => {
    expect(isModernReasoningModel("gpt-6-astra")).toBe(true);
    expect(isModernReasoningModel("gpt-5.6-terra")).toBe(true);
    expect(isModernReasoningModel("gpt-5.6-luna")).toBe(true);
    expect(isModernReasoningModel("gpt-4o-mini")).toBe(false);
  });
});
