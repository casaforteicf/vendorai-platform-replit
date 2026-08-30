import { describe, expect, it } from "vitest";
import {
  ACCESS_PASS_HOURS,
  addAccessDays,
  brazilMonthKey,
  hasActiveAccess,
  nextAccessWindow,
} from "./accessLicenseCore.js";

describe("access license time rules", () => {
  it("uses the calendar month in America/Sao_Paulo", () => {
    const utcAlreadySeptember = new Date("2026-09-01T01:30:00.000Z");
    expect(brazilMonthKey(utcAlreadySeptember)).toBe("2026-08");
  });

  it("grants exactly five consecutive days (120 hours)", () => {
    const start = new Date("2026-08-10T12:00:00.000Z");
    const end = addAccessDays(start);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(ACCESS_PASS_HOURS);
  });

  it("starts a new pass immediately when the previous access expired", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const expired = new Date("2026-08-09T12:00:00.000Z");
    const window = nextAccessWindow(expired, now);
    expect(window.startsAt).toEqual(now);
    expect(window.endsAt).toEqual(new Date("2026-08-15T12:00:00.000Z"));
  });

  it("appends a new pass to the current expiry without losing remaining time", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const currentExpiry = new Date("2026-08-12T12:00:00.000Z");
    const window = nextAccessWindow(currentExpiry, now);
    expect(window.startsAt).toEqual(currentExpiry);
    expect(window.endsAt).toEqual(new Date("2026-08-17T12:00:00.000Z"));
  });
});

describe("access license availability", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("keeps non-enrolled tenants active for safe migration", () => {
    expect(hasActiveAccess(undefined, now)).toBe(true);
  });

  it("keeps legacy tenants continuously active", () => {
    expect(hasActiveAccess({ mode: "legacy", accessEndsAt: null, annualEndsAt: null }, now)).toBe(true);
  });

  it("allows an annual tenant only before the annual expiry", () => {
    expect(hasActiveAccess({
      mode: "annual",
      accessEndsAt: null,
      annualEndsAt: new Date("2027-08-10T12:00:00.000Z"),
    }, now)).toBe(true);
    expect(hasActiveAccess({
      mode: "annual",
      accessEndsAt: null,
      annualEndsAt: new Date("2026-08-10T11:59:59.000Z"),
    }, now)).toBe(false);
  });

  it("puts an expired prepaid tenant in read-only mode", () => {
    expect(hasActiveAccess({
      mode: "prepaid",
      accessEndsAt: new Date("2026-08-10T11:59:59.000Z"),
      annualEndsAt: null,
    }, now)).toBe(false);
  });
});
