import { describe, expect, it } from "vitest";
import { isPublicCasaListing, visibleCasaCategories, visibleCasaSubcategories, projectPracaSourceItem, type CasaPublishableListing } from "./marketplaceCasaCatalog";

const item = (overrides: Partial<CasaPublishableListing> = {}): CasaPublishableListing => ({
  id: "1", category: "moveis", subcategory: "Planejados", publishToPraca: true,
  status: "published", approved: true, isActive: true, eligible: true, ...overrides,
});

describe("Praça.ai publicação seletiva e categorias públicas", () => {
  it("respects the existing nullable product opt-in", () => {
    const base = { id: "p1", ativo: true, categoriaPraca: "moveis" as const, statusPublicacao: "published" as const, aprovado: true };
    expect(isPublicCasaListing(projectPracaSourceItem({ ...base, vendeNoPracaAi: null })!)).toBe(false);
    expect(isPublicCasaListing(projectPracaSourceItem({ ...base, vendeNoPracaAi: false })!)).toBe(false);
    expect(isPublicCasaListing(projectPracaSourceItem({ ...base, vendeNoPracaAi: true })!)).toBe(true);
    expect(projectPracaSourceItem({ ...base, vendeNoPracaAi: true, categoriaPraca: null })).toBeNull();
  });
  it("never exposes unselected, unapproved or disabled listings", () => {
    expect(isPublicCasaListing(item({ publishToPraca: false }))).toBe(false);
    expect(isPublicCasaListing(item({ status: "draft" }))).toBe(false);
    expect(isPublicCasaListing(item({ approved: false }))).toBe(false);
    expect(isPublicCasaListing(item({ isActive: false }))).toBe(false);
    expect(isPublicCasaListing(item({ eligible: false }))).toBe(false);
    expect(isPublicCasaListing(item())).toBe(true);
  });
  it("hides empty categories and restores them when a listing is published", () => {
    expect(visibleCasaCategories([item({ status: "paused" })])).toEqual([]);
    expect(visibleCasaCategories([item()]).map(c => c.key)).toEqual(["moveis"]);
  });
  it("hides subcategories with no published listing", () => {
    expect(visibleCasaSubcategories([
      item(), item({ id: "2", subcategory: "Iluminação", publishToPraca: false }),
      item({ id: "3", subcategory: " Planejados " }),
    ], "moveis")).toEqual(["Planejados"]);
  });
});
