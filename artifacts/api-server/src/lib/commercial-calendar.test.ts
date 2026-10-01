import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_DATES, mergeCommercialDates } from "./commercial-calendar.js";

describe("commercial relationship calendar", () => {
  it("enables the core relationship dates by default", () => {
    const byName = new Map(DEFAULT_COMMERCIAL_DATES.map((item) => [item.name, item]));
    expect(byName.get("Ano Novo")?.active).toBe(true);
    expect(byName.get("Páscoa")?.active).toBe(true);
    expect(byName.get("Natal")?.active).toBe(true);
    expect(byName.get("Dia do Cliente")?.active).toBe(true);
  });

  it("preserves tenant choices while adding missing master dates", () => {
    const merged = mergeCommercialDates([
      { name: "Natal", active: false, daysBeforeToSend: 10, month: 12, day: 25 },
      { name: "Aniversário da Loja", active: true, daysBeforeToSend: 2, month: 8, day: 10 },
    ]);
    const byName = new Map(merged.map((item) => [item.name, item]));
    expect(byName.get("Natal")?.active).toBe(false);
    expect(byName.get("Natal")?.daysBeforeToSend).toBe(10);
    expect(byName.get("Ano Novo")?.active).toBe(true);
    expect(byName.get("Aniversário da Loja")?.active).toBe(true);
  });
});
