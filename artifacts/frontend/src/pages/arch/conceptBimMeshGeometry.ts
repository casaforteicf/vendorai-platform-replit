import { inspectBimModel, type BimModel } from "./conceptBimElementModel";

/** Triangles in world metres (x, elevation, depth). Independent of a particular 3D renderer. */
export type BimTriangleMesh = Readonly<{ id: string; kind: "stair" | "slab" | "roof"; floor: number; positions: readonly number[] }>;
type Point = readonly [number, number, number];
function quad(out: number[], a: Point, b: Point, c: Point, d: Point) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}
function box(out: number[], x: number, y: number, z: number, width: number, height: number, depth: number) {
  const a: Point = [x,y,z], b: Point = [x+width,y,z], c: Point = [x+width,y,z+depth], d: Point = [x,y,z+depth];
  const e: Point = [x,y+height,z], f: Point = [x+width,y+height,z], g: Point = [x+width,y+height,z+depth], h: Point = [x,y+height,z+depth];
  quad(out,d,c,b,a);quad(out,e,f,g,h);quad(out,a,b,f,e);quad(out,b,c,g,f);quad(out,c,d,h,g);quad(out,d,a,e,h);
}

/** floorHeight is a presentation assumption, not an approved BIM storey elevation. */
export function projectBimMeshes(model: BimModel, floorHeight = 2.8): BimTriangleMesh[] {
  if (!Number.isFinite(floorHeight) || floorHeight <= 0) throw new Error("ARQDOR_BIM_INVALID_FLOOR_HEIGHT");
  if (inspectBimModel(model).length) throw new Error("ARQDOR_BIM_INVALID_MODEL");
  return model.elements.map(element => {
    const p: number[] = [];
    const level = element.kind === "roof" ? element.floor : element.parameters.floor;
    const elevation = level * floorHeight;
    if (element.kind === "stair") {
      const { width, stepCount, rise, run } = element.parameters;
      const tread = run / (stepCount - 1), riser = rise / stepCount;
      for (let i = 0; i < stepCount; i++) {
        const z = element.y + i * tread;
        box(p, element.x, elevation, z, width, (i+1)*riser, i === stepCount-1 ? tread : tread);
      }
    } else if (element.kind === "slab") {
      const { width, depth, thickness, openings } = element.parameters;
      // Partition around opening boundaries. Never fill the rectangular opening as solid.
      const xs = [...new Set([0,width,...openings.flatMap(o => [o.x,o.x+o.width])])].sort((a,b)=>a-b);
      const zs = [...new Set([0,depth,...openings.flatMap(o => [o.y,o.y+o.depth])])].sort((a,b)=>a-b);
      for(let i=0;i<xs.length-1;i++) for(let j=0;j<zs.length-1;j++) {
        const mx=(xs[i]+xs[i+1])/2,mz=(zs[j]+zs[j+1])/2;
        if(openings.some(o=>mx>o.x&&mx<o.x+o.width&&mz>o.y&&mz<o.y+o.depth)) continue;
        box(p,element.x+xs[i],elevation,element.y+zs[j],xs[i+1]-xs[i],thickness,zs[j+1]-zs[j]);
      }
    } else {
      const { width, depth, pitchDegrees } = element.parameters;
      const rise = element.parameters.kind === "pitched" ? Math.tan(pitchDegrees*Math.PI/180)*width/2 : 0;
      const x=element.x,z=element.y,y=elevation;
      const left: Point=[x,y,z], leftFar:Point=[x,y,z+depth], ridge:Point=[x+width/2,y+rise,z], ridgeFar:Point=[x+width/2,y+rise,z+depth];
      const right:Point=[x+width,y,z],rightFar:Point=[x+width,y,z+depth];
      quad(p,left,ridge,ridgeFar,leftFar);quad(p,ridge,right,rightFar,ridgeFar);
    }
    return { id:element.id,kind:element.kind,floor:level,positions:p };
  });
}
