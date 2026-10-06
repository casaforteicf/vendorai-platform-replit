import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as any[],
  select: vi.fn(),
  update: vi.fn(),
  getGoogleAdsConnectionByTenantId: vi.fn(),
  refreshGoogleAdsToken: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

vi.mock("@workspace/db", () => {
  const query = () => {
    const chain: any = {
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => mocks.events),
      then: (resolve: any, reject: any) => Promise.resolve(mocks.events).then(resolve, reject),
    };
    return chain;
  };

  mocks.select.mockImplementation(() => ({
    from: vi.fn(() => query()),
  }));
  mocks.update.mockImplementation(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => []),
    })),
  }));

  return {
    db: { select: mocks.select, update: mocks.update },
    adCampaignEventsTable: { id: "id", tenantId: "tenantId", campaignId: "campaignId", eventType: "eventType", metadata: "metadata", createdAt: "createdAt" },
    adCampaignsTable: { id: "id", plataforma: "plataforma" },
    leadsTable: { id: "id", tenantId: "tenantId", email: "email", telefone: "telefone", discoveryData: "discoveryData" },
  };
});

vi.mock("../services/google-ads-oauth.js", () => ({
  getGoogleAdsConnectionByTenantId: mocks.getGoogleAdsConnectionByTenantId,
  refreshGoogleAdsToken: mocks.refreshGoogleAdsToken,
}));

import { runGoogleDataManagerConversionSync } from "./googleDataManagerConversionSync.js";

function logger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
  } as any;
}

describe("Google Data Manager tenant allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events = [];
    vi.stubEnv("GOOGLE_DATA_MANAGER_CONVERSIONS_ENABLED", "true");
    vi.stubEnv("GOOGLE_DATA_MANAGER_VALIDATE_ONLY", "true");
    vi.stubEnv("GOOGLE_DATA_MANAGER_TENANT_IDS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing when the global feature flag is disabled", async () => {
    vi.stubEnv("GOOGLE_DATA_MANAGER_CONVERSIONS_ENABLED", "false");
    const log = logger();

    await runGoogleDataManagerConversionSync(log);

    expect(mocks.select).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("fails closed when the feature flag is on but the tenant allowlist is empty", async () => {
    const log = logger();

    await runGoogleDataManagerConversionSync(log);

    expect(mocks.select).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("nenhum tenant está na allowlist"),
    );
  });

  it("skips an event defensively when its tenant is not allowlisted", async () => {
    vi.stubEnv("GOOGLE_DATA_MANAGER_TENANT_IDS", "tenant-a");
    mocks.events = [{
      id: "event-b",
      tenantId: "tenant-b",
      campaignId: "campaign-b",
      eventType: "sale_closed",
      metadata: {},
      createdAt: new Date(),
    }];
    const log = logger();

    await runGoogleDataManagerConversionSync(log);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.getGoogleAdsConnectionByTenantId).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled?.();
  });
});
