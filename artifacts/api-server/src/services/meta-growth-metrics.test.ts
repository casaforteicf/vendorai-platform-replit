import { describe, expect, it } from "vitest";
import { isPaidMetaLead, summarizeMetaCommercialResults } from "./meta-growth-metrics.js";

describe("Meta Growth paid attribution", () => {
  it("uses the linked campaign platform as the source of truth", () => {
    expect(isPaidMetaLead({
      source: "Instagram Ads",
      adCampaignId: "meta-1",
      campaignPlatform: "meta",
    })).toBe(true);

    expect(isPaidMetaLead({
      source: "Instagram Ads",
      adCampaignId: "google-1",
      campaignPlatform: "google",
    })).toBe(false);
  });

  it("keeps a conservative legacy fallback when no campaign platform is resolvable", () => {
    expect(isPaidMetaLead({
      source: "Meta Ads",
      adCampaignId: null,
      campaignPlatform: null,
    })).toBe(true);

    expect(isPaidMetaLead({
      source: "Instagram orgânico",
      adCampaignId: null,
      campaignPlatform: null,
    })).toBe(false);
  });
});

describe("Meta Growth commercial summary", () => {
  it("separates open pipeline from won revenue and paid revenue", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const result = summarizeMetaCommercialResults({
      metaLeadIds: ["lead-open", "lead-paid", "lead-organic", "lead-lost", "lead-old"],
      paidMetaLeadIds: ["lead-paid"],
      cutoff,
      deals: [
        {
          leadId: "lead-open",
          valor: "1000.00",
          etapa: "proposta",
          wonAt: null,
          dataFechamento: null,
          createdAt: new Date("2026-01-05T00:00:00.000Z"),
        },
        {
          leadId: "lead-paid",
          valor: "2500.00",
          etapa: "ganho",
          wonAt: new Date("2026-01-10T00:00:00.000Z"),
          dataFechamento: null,
          createdAt: new Date("2026-01-04T00:00:00.000Z"),
        },
        {
          leadId: "lead-organic",
          valor: "1500.00",
          etapa: "ganho",
          wonAt: null,
          dataFechamento: new Date("2026-01-11T00:00:00.000Z"),
          createdAt: new Date("2026-01-06T00:00:00.000Z"),
        },
        {
          leadId: "lead-lost",
          valor: "700.00",
          etapa: "perdido",
          wonAt: null,
          dataFechamento: null,
          createdAt: new Date("2026-01-07T00:00:00.000Z"),
        },
        {
          leadId: "lead-old",
          valor: "900.00",
          etapa: "ganho",
          wonAt: new Date("2025-12-20T00:00:00.000Z"),
          dataFechamento: null,
          createdAt: new Date("2025-12-15T00:00:00.000Z"),
        },
        {
          leadId: "lead-foreign",
          valor: "9999.00",
          etapa: "ganho",
          wonAt: new Date("2026-01-12T00:00:00.000Z"),
          dataFechamento: null,
          createdAt: new Date("2026-01-08T00:00:00.000Z"),
        },
      ],
    });

    expect(result).toEqual({
      opportunities30d: 1,
      pipelineValue30d: 1000,
      sales30d: 2,
      revenueClosed30d: 4000,
      paidSales30d: 1,
      paidRevenueClosed30d: 2500,
    });
  });
});
