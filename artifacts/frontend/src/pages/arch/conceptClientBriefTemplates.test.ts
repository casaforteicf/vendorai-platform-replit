import { describe, expect, it } from "vitest";
import { buildClientBriefAlternatives, countBriefAlternativeErrors } from "./conceptClientBrief";

const brief = { bedrooms: 3, suites: 1, floors: 1, garageSpaces: 2, gourmet: true, pool: false, office: false } as never;

describe("opções das Necessidades a partir dos modelos desenhados", () => {
  it("lote 15 × 30 (caso dos 24 erros): três opções, todas sem erro e dentro do lote", () => {
    const options = buildClientBriefAlternatives(brief, 15, 30);
    expect(options.length).toBe(3);
    for (const option of options) {
      expect(countBriefAlternativeErrors(option.rooms, option.floors, 15, 30)).toBe(0);
      for (const room of option.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.width).toBeLessThanOrEqual(15.01);
        expect(room.y + room.depth).toBeLessThanOrEqual(30.01);
      }
    }
  });

  it("a primeira opção é a mais próxima do pedido", () => {
    const [first] = buildClientBriefAlternatives(brief, 15, 30);
    const bedrooms = first.rooms.filter((room) => room.kind === "suite" || room.kind === "quarto").length;
    expect(bedrooms).toBe(3);
    expect(first.floors).toBe(1);
  });

  it("lote estreito de 10 m só oferece o que cabe", () => {
    const options = buildClientBriefAlternatives({ ...(brief as object), floors: 2 } as never, 10, 25);
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(countBriefAlternativeErrors(option.rooms, option.floors, 10, 25)).toBe(0);
  });
});
