import { describe, expect, it } from "vitest";
import {
  assessProjectBriefCompleteness,
  buildClientBriefAlternatives,
  buildClientBriefPlan,
  buildProjectBriefSnapshot,
  buildDefaultRoomProgram,
  buildRecommendedAdjacencyRules,
  countBriefAlternativeErrors,
  rebalanceClientRoomProgramToDesiredArea,
  validateClientRoomProgram,
} from "./conceptClientBrief";

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


describe("programa de necessidades", () => {
  it("bloqueia quando os ambientes úteis ultrapassam a área total desejada", () => {
    const base = {
      bedrooms: 3,
      suites: 1,
      floors: 1,
      garageSpaces: 2,
      gourmet: true,
      pool: false,
      office: false,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 100,
    } as const;
    const validation = validateClientRoomProgram({
      ...base,
      roomProgram: buildDefaultRoomProgram(base),
    });
    expect(validation.status).toBe("blocked");
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("leva as metragens solicitadas para os ambientes preparados para a IA", () => {
    const base = {
      bedrooms: 2,
      suites: 1,
      floors: 2,
      garageSpaces: 1,
      gourmet: false,
      pool: false,
      office: false,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 140,
    } as const;
    const roomProgram = buildDefaultRoomProgram(base).map((item) =>
      item.kind === "sala" ? { ...item, targetArea: 31 } : item
    );
    const plan = buildClientBriefPlan({ ...base, roomProgram });
    const living = plan.rooms.find((room) => room.kind === "sala") as any;
    expect(living.targetArea).toBe(31);
    expect(living.required).toBe(true);
  });

  it("marca pavimento flexível quando o cliente deixa a IA decidir", () => {
    const base = {
      bedrooms: 2,
      suites: 1,
      floors: 2,
      garageSpaces: 1,
      gourmet: false,
      pool: false,
      office: false,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 140,
    } as const;
    const roomProgram = buildDefaultRoomProgram(base).map((item) =>
      item.kind === "quarto" ? { ...item, floorPreference: "qualquer" as const } : item
    );
    const plan = buildClientBriefPlan({ ...base, roomProgram });
    const bedroom = plan.rooms.find((room) => room.kind === "quarto") as any;
    expect(bedroom.floorFlexible).toBe(true);
  });
});


it("redistribui metragens para aproximar o programa da área total", () => {
  const base = {
    bedrooms: 3,
    suites: 1,
    floors: 1,
    garageSpaces: 2,
    gourmet: true,
    pool: false,
    office: false,
    integratedKitchen: true,
    privateAwaySocial: true,
    desiredAreaTotal: 180,
  } as const;
  const roomProgram = buildDefaultRoomProgram(base).map((item) => ({ ...item, targetArea: item.targetArea * 1.35 }));
  const rebalanced = rebalanceClientRoomProgramToDesiredArea({ ...base, roomProgram });
  const before = roomProgram.filter((item) => item.kind !== "piscina")
    .reduce((sum, item) => sum + item.targetArea * item.quantity, 0);
  const after = rebalanced.filter((item) => item.kind !== "piscina")
    .reduce((sum, item) => sum + item.targetArea * item.quantity, 0);
  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThan(120);
});

it("preserva dimensões fixadas pelo cliente ao rebalancear", () => {
  const base = {
    bedrooms: 2,
    suites: 1,
    floors: 1,
    garageSpaces: 1,
    gourmet: false,
    pool: false,
    office: false,
    integratedKitchen: true,
    privateAwaySocial: true,
    desiredAreaTotal: 120,
  } as const;
  const roomProgram = buildDefaultRoomProgram(base).map((item) =>
    item.kind === "suite" ? { ...item, preferredWidth: 4, preferredDepth: 4.5, targetArea: 25 } : item
  );
  const rebalanced = rebalanceClientRoomProgramToDesiredArea({ ...base, roomProgram });
  const suite = rebalanced.find((item) => item.kind === "suite")!;
  expect(suite.targetArea).toBe(18);
  expect(suite.preferredWidth).toBe(4);
  expect(suite.preferredDepth).toBe(4.5);
});


describe("grafo de adjacências", () => {
  it("gera relações recomendadas coerentes com o briefing", () => {
    const base = {
      bedrooms: 3,
      suites: 1,
      floors: 1,
      garageSpaces: 2,
      gourmet: true,
      pool: true,
      office: false,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 220,
    } as const;
    const roomProgram = buildDefaultRoomProgram(base);
    const adjacencyRules = buildRecommendedAdjacencyRules({ ...base, roomProgram });
    const living = roomProgram.find((item) => item.kind === "sala")!;
    const kitchen = roomProgram.find((item) => item.kind === "cozinha")!;
    const suite = roomProgram.find((item) => item.kind === "suite")!;
    const garage = roomProgram.find((item) => item.kind === "garagem")!;

    expect(adjacencyRules.some((rule) =>
      rule.relation === "direct"
      && new Set([rule.fromRequestId, rule.toRequestId]).has(living.id)
      && new Set([rule.fromRequestId, rule.toRequestId]).has(kitchen.id)
    )).toBe(true);
    expect(adjacencyRules.some((rule) =>
      rule.relation === "away"
      && new Set([rule.fromRequestId, rule.toRequestId]).has(suite.id)
      && new Set([rule.fromRequestId, rule.toRequestId]).has(garage.id)
    )).toBe(true);
  });

  it("bloqueia relações contraditórias entre o mesmo par", () => {
    const base = {
      bedrooms: 2,
      suites: 1,
      floors: 1,
      garageSpaces: 1,
      gourmet: false,
      pool: false,
      office: false,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 140,
    } as const;
    const roomProgram = buildDefaultRoomProgram(base);
    const a = roomProgram[0];
    const b = roomProgram[1];
    const validation = validateClientRoomProgram({
      ...base,
      roomProgram,
      adjacencyRules: [
        { id: "r1", fromRequestId: a.id, toRequestId: b.id, relation: "direct", required: true },
        { id: "r2", fromRequestId: a.id, toRequestId: b.id, relation: "away", required: true },
      ],
    });
    expect(validation.status).toBe("blocked");
    expect(validation.errors.some((message) => message.includes("próximos/conectados") || message.includes("afastados"))).toBe(true);
  });

  it("bloqueia relação que aponta para ambiente removido", () => {
    const base = {
      bedrooms: 2,
      suites: 1,
      floors: 1,
      garageSpaces: 1,
      gourmet: false,
      pool: false,
      office: false,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 140,
    } as const;
    const roomProgram = buildDefaultRoomProgram(base);
    const validation = validateClientRoomProgram({
      ...base,
      roomProgram,
      adjacencyRules: [
        { id: "r1", fromRequestId: roomProgram[0].id, toRequestId: "removed-room", relation: "near", required: true },
      ],
    });
    expect(validation.status).toBe("blocked");
    expect(validation.errors.some((message) => message.includes("ambiente removido"))).toBe(true);
  });
});


describe("briefing arquitetônico v2", () => {
  it("consolida família, terreno e DNA em um único snapshot", () => {
    const base = {
      bedrooms: 3,
      suites: 1,
      floors: 1,
      garageSpaces: 2,
      gourmet: true,
      pool: false,
      office: true,
      integratedKitchen: true,
      privateAwaySocial: true,
      desiredAreaTotal: 180,
    } as const;
    const roomProgram = buildDefaultRoomProgram(base);
    const briefWithProgram = {
      ...base,
      roomProgram,
      adjacencyRules: buildRecommendedAdjacencyRules({ ...base, roomProgram }),
    };
    const vision = {
      lifestyle: "familia" as const,
      protagonist: "social" as const,
      priorities: ["luz_natural", "privacidade", "integracao"] as const,
      budgetStrategy: "equilibrar" as const,
      futureNeeds: "Escritório pode virar dormitório no futuro.",
      mustHave: "Sala conectada ao jardim.",
      avoid: "Corredores longos.",
      aestheticReferences: "Arquitetura brasileira contemporânea.",
      preferredMaterials: "Madeira e pedra.",
      constructionMethod: "icf" as const,
      budgetTarget: 850000,
    };
    const snapshot = buildProjectBriefSnapshot({
      brief: briefWithProgram,
      vision: { ...vision, priorities: [...vision.priorities] },
      household: {
        residents: 4,
        children: 2,
        workFromHome: "frequente",
        hostingFrequency: "alta",
        cookingProfile: "intenso",
        routineNotes: "Família cozinha e recebe aos fins de semana.",
      },
      siteContext: {
        frontSide: "top",
        northSide: "right",
        topography: "plano",
        desiredViews: "Jardim dos fundos.",
        privacyNotes: "Evitar exposição para a rua.",
      },
      intervention: "valorizar",
    });

    expect(snapshot.version).toBe(2);
    expect(snapshot.household?.residents).toBe(4);
    expect(snapshot.siteContext?.northSide).toBe("right");
    expect(snapshot.briefingCompleteness).toBeGreaterThanOrEqual(80);
    expect(assessProjectBriefCompleteness(snapshot)).toBe(snapshot.briefingCompleteness);
  });
});
