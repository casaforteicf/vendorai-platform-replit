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
    expect(getUi20VisibleServices({ modules: [{ moduleKey: "agents", isEnabled: false }] }).has("ia")).toBe(false);
    expect(getUi20VisibleServices({ modules: [{ moduleKey: "agents", isEnabled: true, commerciallyEntitled: true }] }).has("ia")).toBe(true);
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

  it("does not show a commercially excluded service", () => {
    const visible = getUi20VisibleServices({
      modules: [{ moduleKey: "marketing", isEnabled: true, commerciallyEntitled: false }],
    });
    expect(visible.has("marketing")).toBe(false);
  });
});
