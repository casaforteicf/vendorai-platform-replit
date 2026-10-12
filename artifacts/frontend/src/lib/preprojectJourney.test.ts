import { describe, expect, it } from "vitest";
import {
  normalizePublicPreprojectLink,
  publicPreprojectPath,
  preprojectNextAction,
} from "./preprojectJourney";

describe("UI-01.7 public preproject journey", () => {
  it("accepts existing public link metadata without creating an account", () => {
    expect(normalizePublicPreprojectLink({
      slug: "loteadora-01", headline: "Projete sua casa",
      tenantName: "Parceiro A", marketEnabled: true,
    })).toEqual({
      slug: "loteadora-01", headline: "Projete sua casa",
      tenantName: "Parceiro A", marketEnabled: true,
    });
    expect(publicPreprojectPath("loteadora-01")).toBe("/projeto/loteadora-01");
  });
  it("rejects untrusted or malformed public link identifiers", () => {
    expect(publicPreprojectPath("../admin")).toBeNull();
    expect(publicPreprojectPath("a/b")).toBeNull();
    expect(normalizePublicPreprojectLink({ slug: "../admin" })).toBeNull();
    expect(normalizePublicPreprojectLink(null)).toBeNull();
  });
  it("requires verification before linking a guest draft to an identity", () => {
    expect(preprojectNextAction("public_entry").requiresVerifiedSession).toBe(false);
    expect(preprojectNextAction("guest_draft").requiresVerifiedSession).toBe(true);
    expect(preprojectNextAction("account_link_pending").requiresVerifiedSession).toBe(true);
    expect(preprojectNextAction("quotations").requiresVerifiedSession).toBe(true);
    expect(preprojectNextAction("execution").requiresVerifiedSession).toBe(true);
  });
});
