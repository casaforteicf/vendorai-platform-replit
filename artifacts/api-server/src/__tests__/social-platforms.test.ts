import { afterEach, describe, expect, it, vi } from "vitest";

describe("social platform OAuth", () => {
  afterEach(() => vi.resetModules());

  it("reports providers without credentials as unavailable", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "");
    const { providerAvailability } = await import("../services/social-platforms.js");
    expect(providerAvailability("youtube").configured).toBe(false);
  }, 15_000);

  it("builds Google OAuth with offline consent for YouTube", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "secret");
    const { buildSocialOAuthUrl } = await import("../services/social-platforms.js");
    const url = new URL(buildSocialOAuthUrl("youtube", "signed-state"));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("signed-state");
  }, 15_000);

  it("uses TikTok client_key and comma separated scopes", async () => {
    vi.stubEnv("TIKTOK_CLIENT_KEY", "tiktok-key");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "secret");
    const { buildSocialOAuthUrl } = await import("../services/social-platforms.js");
    const url = new URL(buildSocialOAuthUrl("tiktok", "state"));
    expect(url.searchParams.get("client_key")).toBe("tiktok-key");
    expect(url.searchParams.get("scope")).toContain("video.publish");
  }, 15_000);
});
