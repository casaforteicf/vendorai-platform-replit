import { describe, expect, it } from "vitest";
import { buildConceptGeometry, validateConceptLayout, type ConceptRoomShape } from "./conceptGeometry";
import { buildConceptRenderBrief } from "./conceptRender";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 76 — critérios de aceite arquitetônico", () => {
  it("reprova banheiro de suíte separado do dormitório", () => {
    const rooms = [
      room({ id: "suite-master", kind: "suite", label: "Suíte master", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "circulacao", kind: "circulacao", label: "Hall íntimo", x: 4, y: 0, width: 1.2, depth: 4 }),
      room({ id: "bath-master", kind: "banheiro", label: "Banheiro suíte master", x: 5.2, y: 0, width: 2, depth: 2.4 }),
    ];

    const issues = validateConceptLayout(rooms, 12, 20, 0);

    expect(issues.some((issue) => issue.id === "suite-bath-adjacency-suite-master-bath-master" && issue.severity === "error")).toBe(true);
  });

  it("aceita banheiro de suíte diretamente adjacente", () => {
    const rooms = [
      room({ id: "suite-master", kind: "suite", label: "Suíte master", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "bath-master", kind: "banheiro", label: "Banheiro suíte master", x: 4, y: 0, width: 2, depth: 2.4 }),
    ];

    const issues = validateConceptLayout(rooms, 12, 20, 0);

    expect(issues.some((issue) => issue.id.startsWith("suite-bath-adjacency-"))).toBe(false);
  });

  it("avisa quando dormitório fica sem abertura externa válida", () => {
    const rooms = [
      room({ id: "top", kind: "sala", label: "Sala", x: 0, y: 0, width: 9, depth: 3 }),
      room({ id: "left", kind: "cozinha", label: "Cozinha", x: 0, y: 3, width: 3, depth: 3 }),
      room({ id: "bed", kind: "quarto", label: "Quarto interno", x: 3, y: 3, width: 3, depth: 3 }),
      room({ id: "right", kind: "sala", label: "Estar lateral", x: 6, y: 3, width: 3, depth: 3 }),
      room({ id: "bottom", kind: "sala", label: "Sala fundos", x: 0, y: 6, width: 9, depth: 3 }),
    ];

    const issues = validateConceptLayout(rooms, 12, 12, 0);

    expect(issues.some((issue) => issue.id === "natural-opening-bed")).toBe(true);
  });

  it("avisa dormitório com largura funcional insuficiente", () => {
    const rooms = [
      room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 0, width: 2.1, depth: 3.2 }),
    ];

    const issues = validateConceptLayout(rooms, 10, 10, 0);

    expect(issues.some((issue) => issue.id === "functional-width-bed")).toBe(true);
  });

  it("sinaliza contato direto entre lavanderia e área íntima", () => {
    const rooms = [
      room({ id: "suite", kind: "suite", label: "Suíte", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "laundry", kind: "lavanderia", label: "Lavanderia", x: 4, y: 0, width: 2.4, depth: 3 }),
    ];

    const issues = validateConceptLayout(rooms, 12, 20, 0);

    expect(issues.some((issue) => issue.id === "service-private-adjacency-laundry-suite")).toBe(true);
  });

  it("mantém janelas em paredes externas e portas conectando ambientes compatíveis", () => {
    const rooms = [
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
    ];

    const geometry = buildConceptGeometry(rooms, 12, 20, 0);

    expect(geometry.openings.some((opening) => opening.type === "door")).toBe(true);
    expect(geometry.openings.some((opening) => opening.type === "window" && opening.roomId === "living")).toBe(true);
    expect(geometry.openings.some((opening) => opening.type === "window" && opening.roomId === "kitchen")).toBe(true);
  });

  it("gera render brief com bloqueio explícito de topologia e aberturas", () => {
    const brief = buildConceptRenderBrief({
      lotWidth: 12,
      lotDepth: 30,
      floors: 1,
      desiredArea: 160,
      rooms: [
        { id: "living", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 4, depth: 4 },
      ],
      facade: {
        style: "contemporaneo",
        primaryMaterial: "pintura",
        accentMaterial: "madeira",
        roof: "platibanda",
        frameTone: "preto",
        facadeTone: "clara",
        landscaping: "moderado",
      },
      lightingMode: "day",
      geometryLock: {
        frontSide: "top",
        exteriorWalls: [{ floor: 0, x1: 0, y1: 0, x2: 4, y2: 0 }],
        openings: [{ floor: 0, type: "window", x: 2, y: 0, width: 2.4, height: 2.1, sillHeight: 0 }],
      },
    } as never);

    expect(brief).toContain("EXACT WALL TOPOLOGY LOCK");
    expect(brief).toContain("EXACT OPENING LOCK");
    expect(brief).toContain("GEOMETRY HAS PRIORITY OVER STYLE");
    expect(brief).toContain("do not add, remove, merge or relocate openings");
  });
});
