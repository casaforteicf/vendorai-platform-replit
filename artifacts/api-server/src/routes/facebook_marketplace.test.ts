import { describe, expect, it } from "vitest";
import { effectivePrice, fallbackDraft, uniqueMedia } from "./facebook_marketplace.js";

describe("Facebook Marketplace draft helpers", () => {
  it("uses an active promotional price", () => {
    expect(
      effectivePrice({
        precoBase: "199.90",
        precoPromocional: "149.90",
        promocaoAtivaAte: new Date("2099-12-31T23:59:59Z"),
      }),
    ).toBe("149.90");
  });

  it("falls back to base price when promotion expired", () => {
    expect(
      effectivePrice({
        precoBase: "199.90",
        precoPromocional: "149.90",
        promocaoAtivaAte: new Date("2020-01-01T00:00:00Z"),
      }),
    ).toBe("199.90");
  });

  it("deduplicates media and keeps the Marketplace payload bounded", () => {
    const provided = Array.from({ length: 12 }, (_, index) => `https://cdn.test/${index}.jpg`);
    const media = uniqueMedia(
      {
        imagemUrl: "https://cdn.test/0.jpg",
        imagens: ["https://cdn.test/1.jpg", "https://cdn.test/extra.jpg"],
      },
      provided,
    );

    expect(media).toHaveLength(10);
    expect(new Set(media).size).toBe(10);
    expect(media[0]).toBe("https://cdn.test/0.jpg");
  });

  it("builds a factual fallback draft without invented commercial claims", () => {
    const draft = fallbackDraft(
      {
        nome: "Piso Drenante",
        marca: "Branno",
        descricao: "Placa para área externa",
        cor: "Nero",
        unidade: "m²",
      },
      "Casa e construção",
    );

    expect(draft.title).toContain("Piso Drenante");
    expect(draft.title).toContain("Branno");
    expect(draft.description).toContain("Placa para área externa");
    expect(draft.description).toContain("Cor: Nero");
    expect(draft.category).toBe("Casa e construção");
  });
});
