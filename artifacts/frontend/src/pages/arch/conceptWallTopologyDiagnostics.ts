import { buildOrthogonalWallTopology, type WallNetworkSegment } from "./conceptWallNetwork";

export type FloorWall = WallNetworkSegment & { floor: number };
export type WallJunction = {
  floor: number;
  x: number;
  y: number;
  kind: "end" | "corner" | "tee" | "cross" | "multi";
  sourceWallIds: string[];
  segmentCount: number;
};

/** Read-only topology diagnostics. Does not mutate the source BIM wall geometry. */
export function identifyWallJunctions(walls: FloorWall[]): WallJunction[] {
  const floors = [...new Set(walls.map((wall) => wall.floor))].sort((a, b) => a - b);
  return floors.flatMap((floor) => {
    const topology = buildOrthogonalWallTopology(walls.filter((wall) => wall.floor === floor));
    return topology.nodes
      .filter((node) => node.segmentIds.length > 0)
      .map((node) => {
        const count = node.segmentIds.length;
        const kind: WallJunction["kind"] = count === 1 ? "end"
          : count === 2 ? "corner" : count === 3 ? "tee"
          : count === 4 ? "cross" : "multi";
        return {
          floor, x: node.x, y: node.y, kind,
          sourceWallIds: [...node.sourceWallIds].sort(),
          segmentCount: count,
        };
      });
  });
}
