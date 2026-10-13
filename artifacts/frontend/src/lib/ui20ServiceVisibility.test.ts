import { describe, expect, it } from "vitest";
import { getUi20VisibleServices } from "./ui20ServiceVisibility";

describe("UI20 service visibility (presentation only)", () => {
  it("keeps essential services and hides administrative settings for ordinary users", () => {
    const visible = getUi20VisibleServices({ modules: [], isAdmin: false });
    expect(visible.has("home")).toBe(true);
    expect(visible.has("support")).toBe(true);
    expect(visible.has("settings")).toBe(false);
    expect(visible.has("erp")).toBe(false);
    expect(visible.has("arqdor")).toBe(false);
  });

  it("shows only universal shell while the tenant module inventory is loading", () => {
    const visible = getUi20VisibleServices({ loading: true, isAdmin: true, arqdorEligible: true });
    expect([...visible].sort()).toEqual(["home", "support"]);
  });

  it("does not expose IA without explicit enabled entitlement", () => {
    expect(getUi20VisibleServices({ modules: [] }).has("ia")).toBe(false);
    expect(getUi20VisibleServices({ modules: [{ moduleKey: "vendor_brain", isEnabled: false }] }).has("ia")).toBe(false);
    expect(getUi20VisibleServices({ modules: [{ moduleKey: "vendor_brain", isEnabled: true, commerciallyEntitled: true }] }).has("ia")).toBe(true);
  });

  it("uses catalog keys to show CRM, Marketing and settings", () => {
    const visible = getUi20VisibleServices({ isAdmin: true, modules: [
      { moduleKey: "leads", isEnabled: true },
      { moduleKey: "campaigns", isEnabled: true },
      { moduleKey: "settings", isEnabled: true },
    ] });
    expect(visible.has("crm")).toBe(true);
    expect(visible.has("marketing")).toBe(true);
    expect(visible.has("settings")).toBe(true);
  });

  it("does not show ERP without an enabled financial entitlement", () => {
    const visible = getUi20VisibleServices({
      modules: [{ moduleKey: "financeiro", isEnabled: false, hasOverride: true }],
    });
    expect(visible.has("erp")).toBe(false);
  });

  it("shows ERP with the enabled entitlement and hides explicitly disabled Arqdor", () => {
    const visible = getUi20VisibleServices({
      arqdorEligible: true,
      modules: [
        { moduleKey: "financeiro", isEnabled: true, commerciallyEntitled: true },
        { moduleKey: "arch", isEnabled: false, hasOverride: true },
      ],
    });
    expect(visible.has("erp")).toBe(true);
    expect(visible.has("arqdor")).toBe(false);
  });

  it("shows Arqdor for eligible tenants without an explicit arch override", () => {
    expect(getUi20VisibleServices({ arqdorEligible: true, modules: [] }).has("arqdor")).toBe(true);
    expect(getUi20VisibleServices({ arqdorEligible: true, modules: [
      { moduleKey: "arch", isEnabled: false, hasOverride: false },
    ] }).has("arqdor")).toBe(true);
  });

  it("does not expose Arqdor to an ineligible vertical", () => {
    expect(getUi20VisibleServices({ arqdorEligible: false, modules: [
      { moduleKey: "arch", isEnabled: true },
    ] }).has("arqdor")).toBe(false);
  });

  it("keeps explicit arch denial even when other services are enabled", () => {
    const services = getUi20VisibleServices({ arqdorEligible: true, modules: [
      { moduleKey: "arch", isEnabled: false, hasOverride: true },
      { moduleKey: "leads", isEnabled: true },
    ] });
    expect(services.has("arqdor")).toBe(false);
    expect(services.has("crm")).toBe(true);
  });

  it("does not show a commercially excluded service", () => {
    const visible = getUi20VisibleServices({
      modules: [{ moduleKey: "content", isEnabled: true, commerciallyEntitled: false }],
    });
    expect(visible.has("marketing")).toBe(false);
  });
});
