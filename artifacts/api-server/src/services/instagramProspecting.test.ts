import { describe, expect, it } from "vitest";
import {
  normalizeInstagramUsername,
  parseInstagramUsernames,
  profileMatchesInstagramFilters,
} from "./instagramProspecting.js";

describe("instagramProspecting", () => {
  it("normaliza @username e URLs do Instagram", () => {
    expect(normalizeInstagramUsername("@Vendor.AI")).toBe("vendor.ai");
    expect(normalizeInstagramUsername("https://www.instagram.com/Vendor_AI/?hl=pt-br")).toBe("vendor_ai");
  });

  it("aceita lista, remove duplicados e preserva somente usernames válidos", () => {
    expect(parseInstagramUsernames("@Alpha, beta\nhttps://instagram.com/ALPHA/ ; gamma!")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("aplica seguidores, site e atividade somente sobre métricas verificadas", () => {
    const profile = {
      followersCount: 12_500,
      website: "https://example.com",
      latestMediaAt: "2026-09-01T12:00:00Z",
    };
    const now = new Date("2026-09-04T12:00:00Z");
    expect(profileMatchesInstagramFilters(profile, { minFollowers: 10_000, maxFollowers: 20_000, hasWebsite: true, activeWithinDays: 7 }, now)).toBe(true);
    expect(profileMatchesInstagramFilters(profile, { minFollowers: 20_000 }, now)).toBe(false);
    expect(profileMatchesInstagramFilters(profile, { activeWithinDays: 1 }, now)).toBe(false);
  });
});
