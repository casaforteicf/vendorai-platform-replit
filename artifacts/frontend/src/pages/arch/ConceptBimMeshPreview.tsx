import { useMemo } from "react";
import { projectBimMeshes } from "./conceptBimMeshGeometry";
import type { BimModel } from "./conceptBimElementModel";

type Vertex = [number, number];
const project = (x: number, y: number, z: number): Vertex => [x - z * 0.7, (x + z) * 0.35 - y * 1.3];

/** Experimental isometric 3D view of actual BIM triangles; not the production WebGL scene. */
export function ConceptBimMeshPreview({ model }: { model: BimModel }) {
  const triangles = useMemo(() => {
    const faces: Array<{ id: string; points: Vertex[] }> = [];
    for (const mesh of projectBimMeshes(model)) {
      const p = mesh.positions;
      for (let i = 0; i < p.length; i += 9) {
        faces.push({
          id: mesh.id + ":" + i,
          points: [project(p[i], p[i + 1], p[i + 2]), project(p[i + 3], p[i + 4], p[i + 5]), project(p[i + 6], p[i + 7], p[i + 8])],
        });
      }
    }
    return faces;
  }, [model]);
  const coords = triangles.flatMap(face => face.points);
  const minX = Math.min(0, ...coords.map(v => v[0]));
  const maxX = Math.max(1, ...coords.map(v => v[0]));
  const minY = Math.min(0, ...coords.map(v => v[1]));
  const maxY = Math.max(1, ...coords.map(v => v[1]));
  const scale = Math.min(220 / Math.max(1, maxX - minX), 220 / Math.max(1, maxY - minY));
  return <svg viewBox="0 0 260 260" role="img" aria-label="Prévia isométrica experimental de escadas lajes e coberturas" className="h-64 w-full rounded bg-zinc-950">
    {triangles.map(face => <polygon key={face.id}
      points={face.points.map(([x,y]) => [20+(x-minX)*scale,20+(y-minY)*scale].join(",")).join(" ")}
      fill="rgba(52,165,119,0.12)" stroke="rgba(94,234,160,0.42)" strokeWidth="0.4" />)}
  </svg>;
}
