import { describe, it, expect } from "vitest";
import { ui20ServiceForPath, ui20SidebarServiceForPath } from "./ui20ServiceRoutes";
describe("UI20 route resolution", () => {
  it.each([
    ["/tad", "home"], ["/dashboard", "home"], ["/leads", "crm"], ["/pipeline-operacional", "crm"],
    ["/marketing/instagram", "marketing"], ["/content", "marketing"],
    ["/content-studio/video", "marketing"], ["/content-autopilot", "marketing"],
    ["/erp", "erp"], ["/erp/titulos", "erp"], ["/estoque", "erp"], ["/agents/config", "ia"], ["/marketplace", "marketplace"],
    ["/arch/projetos", "arqdor"], ["/faq", "support"], ["/configuracoes", "settings"],
    ["/leads?tab=ativos", "crm"],
  ])("maps %s to %s", (path, expected) => expect(ui20ServiceForPath(path)).toBe(expected));
  it("does not match accidental partial prefixes", () => {
    expect(ui20ServiceForPath("/archived")).toBeNull();
    expect(ui20ServiceForPath("/marketplace-new")).toBeNull();
    expect(ui20ServiceForPath("/content-studio-old")).toBeNull();
  });
});

describe("Marketing contextual sidebar", () => {
  it.each(["/midias", "/midias/informacoes", "/midias/informacoes?tab=arquivos"])(
    "keeps %s in Marketing's navigation while preserving original route classification",
    (path) => {
      expect(ui20ServiceForPath(path)).toBe("library");
      expect(ui20SidebarServiceForPath(path)).toBe("marketing");
    },
  );
  it("does not absorb unrelated sections", () => {
    expect(ui20SidebarServiceForPath("/midias-legado")).toBeNull();
    expect(ui20SidebarServiceForPath("/leads")).toBe("crm");
    expect(ui20SidebarServiceForPath("/arch/render")).toBe("arqdor");
  });
});
