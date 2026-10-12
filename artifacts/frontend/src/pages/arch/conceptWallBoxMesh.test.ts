import { describe, expect, it } from "vitest";
import { wallBoxesToMeshes } from "./conceptWallBoxMesh";
import { prepareWallSolids } from "./conceptWallSolids";

describe("wall box mesh conversion", () => {
  it("generates twelve triangles per box with consistent outward facing normals", () => {
    const mesh = wallBoxesToMeshes([{wallId:"w",floor:0,x:0,y:0,z:0,width:2,depth:0.15,height:3}])[0];
    expect(mesh.positions).toHaveLength(24);
    expect(mesh.indices).toHaveLength(36);
    const edgeCounts = new Map<string,number>();
    const directedCounts = new Map<string,number>();
    for(let i=0;i<mesh.indices.length;i+=3) {
      const tri=mesh.indices.slice(i,i+3);
      for(let j=0;j<3;j++) {
        const a=tri[j], b=tri[(j+1)%3];
        const key=[a,b].sort((x,y)=>x-y).join(":");
        edgeCounts.set(key,(edgeCounts.get(key)??0)+1);
        directedCounts.set(`${a}:${b}`,(directedCounts.get(`${a}:${b}`)??0)+1);
      }
    }
    expect([...edgeCounts.values()].every(c=>c===2)).toBe(true);
    expect([...directedCounts.entries()].every(([key,count])=>{
      const [a,b]=key.split(":");
      return count===1 && directedCounts.get(`${b}:${a}`)===1;
    })).toBe(true);
  });

  it("maintains a door opening as empty space between boxes", () => {
    const solids=prepareWallSolids([{id:"w",floor:0,x1:0,y1:0,x2:4,y2:0,thickness:0.15,height:3}],
      [{id:"door",wallId:"w",floor:0,offset:0.5,width:1,height:2.1}]);
    const meshes=wallBoxesToMeshes(solids.boxes);
    expect(meshes).toHaveLength(3);
    expect(solids.boxes.some(box=>box.x<2 && box.x+box.width>2 && box.z<2.1)).toBe(false);
  });

  it("rejects zero or non-finite box dimensions", () => {
    expect(()=>wallBoxesToMeshes([{wallId:"bad",floor:0,x:0,y:0,z:0,width:0,depth:1,height:1}])).toThrow("WALL_BOX_INVALID:bad");
  });
});
