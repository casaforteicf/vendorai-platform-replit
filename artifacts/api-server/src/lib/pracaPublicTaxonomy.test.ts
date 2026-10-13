import { describe, expect, it } from "vitest";
import { publicPracaCategories, type PracaPublicListingCategory, type PracaTaxonomyNode } from "./pracaPublicTaxonomy";

const cats: PracaTaxonomyNode[] = [
  { id: "c", parentId: null, name: "Casa", active: true, approved: true },
  { id: "m", parentId: "c", name: "Móveis", active: true, approved: true },
  { id: "e", parentId: "c", name: "Eletros", active: true, approved: true },
  { id: "d", parentId: null, name: "Desativada", active: false, approved: true },
];
const listing = (categoryId: string, patch: Partial<PracaPublicListingCategory> = {}): PracaPublicListingCategory => ({
  categoryId, publishToPraca: true, published: true, active: true, approved: true, eligible: true, ...patch,
});

describe("Praça.ai public category tree", () => {
  it("shows a parent only while a descendant has a public listing", () => {
    expect(publicPracaCategories(cats, [listing("m")]).map(x => x.id)).toEqual(["c", "m"]);
    expect(publicPracaCategories(cats, [listing("m", { active: false })])).toEqual([]);
  });
  it("keeps empty siblings, invalid categories and private items hidden", () => {
    expect(publicPracaCategories(cats, [listing("m"), listing("e", { approved: false }), listing("d")]).map(x => x.id)).toEqual(["c", "m"]);
  });
  it("counts multiple eligible children in ancestor without double counting", () => {
    expect(publicPracaCategories(cats, [listing("m"), listing("e")]).find(x => x.id === "c")?.publicListingCount).toBe(2);
  });
  it("rejects a listing under an unapproved ancestor", () => {
    expect(publicPracaCategories([{ id: "p", parentId: null, name: "Pending", active: true, approved: false }, { id: "s", parentId: "p", name: "Leaf", active: true, approved: true }], [listing("s")])).toEqual([]);
  });
  it("rejects cyclic categories", () => {
    expect(publicPracaCategories([{ id: "a", parentId: "b", name: "A", active: true, approved: true }, { id: "b", parentId: "a", name: "B", active: true, approved: true }], [listing("a")])).toEqual([]);
  });
});
