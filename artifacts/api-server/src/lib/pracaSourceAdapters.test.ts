import { describe, expect, it } from "vitest";
import { publicCandidateFromProduct, publicCandidateFromService } from "./pracaSourceAdapters";

const approval = { published: true, approved: true, eligible: true, sellerName: "Empresa", publicCategoryId: "moveis" };
const product = { id: "p", nome: "Armário", categoriaId: "tenant-category", vendeNoPracaAi: true, ativo: true, precoPracaAi: "120.50" };
const service = { id: "s", nome: "Instalação", categoria: "Instalação", vendeNoPracaAi: true, ativo: true };

describe("Praça.ai source adapters", () => {
  it("requires explicit canonical approval in addition to product opt-in", () => {
    expect(publicCandidateFromProduct(product, null)).toBeNull();
    expect(publicCandidateFromProduct({ ...product, vendeNoPracaAi: null }, approval)).toBeNull();
    expect(publicCandidateFromProduct(product, { ...approval, approved: false })).toBeNull();
    expect(publicCandidateFromProduct(product, approval)?.price).toBe(120.5);
  });
  it("requires valid service state and public category mapping", () => {
    expect(publicCandidateFromService(service, null)).toBeNull();
    expect(publicCandidateFromService({ ...service, ativo: false }, approval)).toBeNull();
    expect(publicCandidateFromService(service, { ...approval, publicCategoryId: null })).toBeNull();
    expect(publicCandidateFromService(service, approval)?.kind).toBe("service");
  });
  it("never leaks tenant category ids into the public category field", () => {
    expect(publicCandidateFromProduct(product, approval)?.categoryId).toBe("moveis");
  });
});
