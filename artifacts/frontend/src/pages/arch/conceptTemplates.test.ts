import { describe, expect, it } from "vitest";
import { buildTypologyPlan, CONCEPT_TYPOLOGIES } from "./conceptTemplates";
import { validateConceptLayout } from "./conceptGeometry";
import { DEFAULT_SITE_PLACEMENT, resolveSiteSetbacks } from "./conceptSitePlacement";

const EPS = 0.05;

type R = { id: string; kind: string; label: string; x: number; y: number; width: number; depth: number; floor: number };

function touches(a: R, b: R) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  const vertical = (Math.abs(a.x + a.width - b.x) < EPS || Math.abs(b.x + b.width - a.x) < EPS) && overlapY > 0.6;
  const horizontal = (Math.abs(a.y + a.depth - b.y) < EPS || Math.abs(b.y + b.depth - a.y) < EPS) && overlapX > 0.6;
  return vertical || horizontal;
}

function overlapArea(a: R, b: R) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const d = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return w > EPS && d > EPS ? w * d : 0;
}

function connected(rooms: R[]) {
  if (rooms.length <= 1) return true;
  const seen = new Set([rooms[0].id]);
  const queue = [rooms[0]];
  while (queue.length) {
    const current = queue.shift()!;
    for (const other of rooms) {
      if (!seen.has(other.id) && touches(current, other)) {
        seen.add(other.id);
        queue.push(other);
      }
    }
  }
  return seen.size === rooms.length;
}

const LOT_DEPTH = 30;

describe.each(CONCEPT_TYPOLOGIES.map((item) => [item.id, item] as const))("modelo %s", (_id, template) => {
  const setbacks = resolveSiteSetbacks(DEFAULT_SITE_PLACEMENT);
  const rooms = buildTypologyPlan(template.id, template.minLotWidth, LOT_DEPTH, DEFAULT_SITE_PLACEMENT.frontSide, setbacks) as R[] | null;

  it("cabe no lote mínimo anunciado", () => {
    expect(rooms).not.toBeNull();
  });

  it("não tem erro de validação em nenhum pavimento", () => {
    for (let floor = 0; floor < template.floors; floor += 1) {
      const errors = validateConceptLayout(rooms ?? [], template.minLotWidth, LOT_DEPTH, floor).filter((issue) => issue.severity === "error");
      expect(errors.map((issue) => issue.message)).toEqual([]);
    }
  });

  it("não tem cômodos sobrepostos", () => {
    const list = rooms ?? [];
    for (let floor = 0; floor < template.floors; floor += 1) {
      const current = list.filter((room) => room.floor === floor && room.kind !== "escada");
      for (let i = 0; i < current.length; i += 1) {
        for (let j = i + 1; j < current.length; j += 1) {
          expect(overlapArea(current[i], current[j]), `${current[i].label} × ${current[j].label}`).toBe(0);
        }
      }
    }
  });

  it("cômodos de cada pavimento formam uma casa contínua", () => {
    for (let floor = 0; floor < template.floors; floor += 1) {
      const built = (rooms ?? []).filter((room) => room.floor === floor && room.kind !== "piscina");
      expect(connected(built)).toBe(true);
    }
  });

  it("toda suíte tem banheiro próprio encostado", () => {
    const list = rooms ?? [];
    for (const suite of list.filter((room) => room.kind === "suite")) {
      const baths = list.filter((room) => room.floor === suite.floor && room.kind === "banheiro" && /su[ií]te|master/i.test(room.label));
      expect(baths.some((bath) => touches(bath, suite)), suite.label).toBe(true);
    }
  });

  it("pavimento superior apoiado no térreo", () => {
    if (template.floors < 2) return;
    const list = rooms ?? [];
    const ground = list.filter((room) => room.floor === 0 && room.kind !== "piscina");
    const upper = list.filter((room) => room.floor === 1);
    const minX = Math.min(...ground.map((room) => room.x));
    const maxX = Math.max(...ground.map((room) => room.x + room.width));
    const minY = Math.min(...ground.map((room) => room.y));
    const maxY = Math.max(...ground.map((room) => room.y + room.depth));
    for (const room of upper) {
      expect(room.x >= minX - EPS && room.x + room.width <= maxX + EPS, room.label).toBe(true);
      expect(room.y >= minY - EPS && room.y + room.depth <= maxY + EPS, room.label).toBe(true);
    }
  });

  it("garagem na frente do lote", () => {
    const garage = (rooms ?? []).find((room) => room.kind === "garagem");
    if (!garage) return;
    const ground = (rooms ?? []).filter((room) => room.floor === 0);
    const front = Math.min(...ground.map((room) => room.y));
    expect(Math.abs(garage.y - front)).toBeLessThan(EPS);
  });
});
