import { describe, expect, it } from "vitest";
import { buildWallGeometry, type ParametricWall } from "./RenderStudioParametricWebgl";

function wall(start: [number, number], end: [number, number],
  openings: ParametricWall["openings"] = []): ParametricWall {
  return { id: "wall", start, end, height: 3, thickness: .2, openings };
}

class MockBufferGeometry {
  positions: number[] = [];
  setAttribute(_name: string, attribute: { values: number[] }) {
    this.positions = attribute.values;
  }
  computeVertexNormals() {}
}
class MockFloat32BufferAttribute {
  constructor(public values: number[], public size: number) {}
}
const THREE = { BufferGeometry: MockBufferGeometry, Float32BufferAttribute: MockFloat32BufferAttribute };

describe("Arqdor wall mesh geometry for diagonal walls", () => {
  const window = { id: "janela", kind: "window" as const,
    offset: 1, width: 1, sill: 1, height: 1 };

  it("generates a diagonal mesh with a real opening", () => {
    const mesh = buildWallGeometry(THREE, wall([0, 0], [3, 4], [window]));
    expect(mesh.positions).toHaveLength(64 * 9);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
  });

  it("releases geometry if normal computation fails", () => {
    let disposed = 0;
    class FailingGeometry extends MockBufferGeometry {
      computeVertexNormals() { throw new Error("GPU geometry failure"); }
      dispose() { disposed++; }
    }
    const failingThree = { ...THREE, BufferGeometry: FailingGeometry };
    expect(() => buildWallGeometry(failingThree, wall([0, 0], [3, 4], [window])))
      .toThrow("GPU geometry failure");
    expect(disposed).toBe(1);
  });

  it("releases geometry if attribute assignment fails", () => {
    let disposed = 0;
    class FailingAttributeGeometry extends MockBufferGeometry {
      setAttribute() { throw new Error("attribute failure"); }
      dispose() { disposed++; }
    }
    const failingThree = { ...THREE, BufferGeometry: FailingAttributeGeometry };
    expect(() => buildWallGeometry(failingThree, wall([0, 0], [3, 4], [window])))
      .toThrow("attribute failure");
    expect(disposed).toBe(1);
  });

  it("rejects invalid coordinates before generating a mesh", () => {
    expect(() => buildWallGeometry(THREE, wall([Number.NaN, 0], [3, 4])))
      .toThrow(/Coordenadas/);
    expect(() => buildWallGeometry(THREE, wall([0, 0], [Infinity, 4])))
      .toThrow(/Coordenadas/);
  });

  it("rejects overlapping openings and accepts adjacent openings", () => {
    const overlapping = { ...window, id: "janela2", offset: 1.3 };
    expect(() => buildWallGeometry(THREE, wall([0, 0], [3, 4], [window, overlapping])))
      .toThrow(/sobrepostas/);
    const adjacent = { ...window, id: "janela2", offset: 2 };
    const mesh = buildWallGeometry(THREE, wall([0, 0], [3, 4], [window, adjacent]));
    expect(mesh.positions).toHaveLength(80 * 9);
  });
});
