import { describe, expect, it } from "vitest";
import {
  buildDefaultRoomProgram,
  enrichBriefWithClientVision,
  type ClientBrief,
  type ClientVision,
} from "./conceptClientBrief";

function baseBrief(): ClientBrief {
  const brief: ClientBrief = {
    bedrooms: 3,
    suites: 1,
    floors: 1,
    garageSpaces: 2,
    gourmet: true,
    pool: false,
    office: true,
    integratedKitchen: false,
    privateAwaySocial: false,
    desiredAreaTotal: 180,
  };
  return { ...brief, roomProgram: buildDefaultRoomProgram(brief), adjacencyRules: [] };
}

function baseVision(): ClientVision {
  return {
    lifestyle: "misto",
    protagonist: "social",
    priorities: [],
    budgetStrategy: "equilibrar",
    futureNeeds: "",
    mustHave: "",
    avoid: "",
    household: { adults: 2, children: 0, elderly: 0, pets: false },
    routine: {
      homeOffice: "never",
      receivesGuests: "sometimes",
      cooking: "daily",
      laundry: "basic",
      accessibility: "none",
    },
  };
}

describe("programa arquitetônico inteligente · etapa 92", () => {
  it("transforma privacidade do cliente em regra arquitetônica", () => {
    const enriched = enrichBriefWithClientVision(baseBrief(), {
      ...baseVision(),
      lifestyle: "tranquilidade",
      priorities: ["privacidade"],
    });
    expect(enriched.privateAwaySocial).toBe(true);
  });

  it("afasta home office diário da área social", () => {
    const brief = baseBrief();
    const enriched = enrichBriefWithClientVision(brief, {
      ...baseVision(),
      routine: { ...baseVision().routine!, homeOffice: "daily" },
    });
    const office = enriched.roomProgram?.find((item) => /escrit|office/i.test(item.label));
    const living = enriched.roomProgram?.find((item) => item.kind === "sala");
    expect(office).toBeTruthy();
    expect(living).toBeTruthy();
    expect(enriched.adjacencyRules?.some((rule) =>
      rule.relation === "away"
      && [rule.fromRequestId, rule.toRequestId].includes(office!.id)
      && [rule.fromRequestId, rule.toRequestId].includes(living!.id)
    )).toBe(true);
  });

  it("aproxima banheiro social do convívio quando há idoso ou acessibilidade obrigatória", () => {
    const enriched = enrichBriefWithClientVision(baseBrief(), {
      ...baseVision(),
      household: { adults: 2, children: 0, elderly: 1, pets: false },
      routine: { ...baseVision().routine!, accessibility: "required" },
    });
    const bath = enriched.roomProgram?.find((item) => /banheiro social|lavabo/i.test(item.label));
    const living = enriched.roomProgram?.find((item) => item.kind === "sala");
    expect(enriched.adjacencyRules?.some((rule) =>
      rule.relation === "near"
      && rule.required
      && [rule.fromRequestId, rule.toRequestId].includes(bath!.id)
      && [rule.fromRequestId, rule.toRequestId].includes(living!.id)
    )).toBe(true);
  });

  it("torna integração coerente quando cozinha é protagonista", () => {
    const enriched = enrichBriefWithClientVision(baseBrief(), {
      ...baseVision(),
      protagonist: "cozinha",
      routine: { ...baseVision().routine!, cooking: "enthusiast" },
    });
    expect(enriched.integratedKitchen).toBe(true);
    const kitchen = enriched.roomProgram?.find((item) => item.kind === "cozinha");
    const living = enriched.roomProgram?.find((item) => item.kind === "sala");
    expect(enriched.adjacencyRules?.some((rule) =>
      rule.relation === "direct"
      && [rule.fromRequestId, rule.toRequestId].includes(kitchen!.id)
      && [rule.fromRequestId, rule.toRequestId].includes(living!.id)
    )).toBe(true);
  });
});
