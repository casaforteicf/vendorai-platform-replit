import { describe, it, expect } from "vitest";
import { ui20ServiceForPath } from "./ui20ServiceRoutes";
describe("UI20 route resolution", () => {
  it.each([
    ["/dashboard", "home"], ["/leads", "crm"], ["/pipeline-operacional", "crm"],
    ["/marketing/instagram", "marketing"], ["/content", "marketing"],
    ["/estoque", "erp"], ["/agents/config", "ia"], ["/marketplace", "marketplace"],
    ["/arch/projetos", "arqdor"], ["/faq", "support"], ["/configuracoes", "settings"],
    ["/leads?tab=ativos", "crm"],
  ])("maps %s to %s", (path, expected) => expect(ui20ServiceForPath(path)).toBe(expected));
  it("does not match accidental partial prefixes", () => {
    expect(ui20ServiceForPath("/archived")).toBeNull();
    expect(ui20ServiceForPath("/marketplace-new")).toBeNull();
  });
});
