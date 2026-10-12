import { describe, it, expect } from "vitest";
import { buildPracaPublicCatalog, type PracaListingCandidate } from "./pracaPublicCatalog";
const cats = [
  { id: "home", parentId: null, name: "Casa", active: true, approved: true },
  { id: "m", parentId: "home", name: "Móveis", active: true, approved: true },
  { id: "s", parentId: "home", name: "Serviços", active: true, approved: true },
];
const listing = (patch: Partial<PracaListingCandidate> = {}): PracaListingCandidate => ({
  id: "a", kind: "product", title: "Mesa", description: "Madeira",
  sellerName: "Loja", categoryId: "m", publishToPraca: true,
  published: true, active: true, approved: true, eligible: true, ...patch,
});
describe("Praça.ai public catalogue projection", () => {
  it("hides unapproved and private listings and empty categories", () => {
    const result = buildPracaPublicCatalog(cats, [listing(), listing({ id: "b", categoryId: "s", publishToPraca: false })]);
    expect(result.items.map(i => i.id)).toEqual(["a"]);
    expect(result.categories.map(c => c.id)).toEqual(["home", "m"]);
  });
  it("filters services, full-text search and parent categories", () => {
    const result = buildPracaPublicCatalog(cats, [
      listing(), listing({ id: "b", kind: "service", categoryId: "s", title: "Instalação", sellerName: "Técnica" }),
    ], { kind: "service", search: "INSTALA", categoryId: "home" });
    expect(result.items.map(i => i.id)).toEqual(["b"]);
    expect(result.total).toBe(1);
  });
  it("does not expose private project metadata via public projection", () => {
    const input = { ...listing(), projectId: "secret", internalCost: 999 };
    const result = buildPracaPublicCatalog(cats, [input]);
    expect(result.items[0]).not.toHaveProperty("projectId");
    expect(result.items[0]).not.toHaveProperty("internalCost");
  });
});
