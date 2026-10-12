import { describe, expect, it } from "vitest";
import { exportRenderGeometry } from "./render-geometry-export";

function matrix() {
  const elements = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  return {elements,determinant:()=>1,clone:()=>({invert:()=>({transpose:()=>({elements})})})};
}
function root(mesh: Record<string,unknown>) {
  return {updateMatrixWorld:()=>undefined,traverse:(visit:(node:unknown)=>void)=>visit({
    isMesh:true,visible:true,uuid:"test-mesh",material:{uuid:"mat"},matrixWorld:matrix(),...mesh,
  })};
}
function attr(values:number[],itemSize:number) {
  return {itemSize,count:values.length/itemSize,getX:(i:number)=>values[i*itemSize],getY:(i:number)=>values[i*itemSize+1],
    getZ:(i:number)=>values[i*itemSize+2]};
}
const geometry={
  attributes:{
    position:attr([0,0,0,1,0,0,0,1,0],3),
    normal:attr([0,0,1,0,0,1,0,0,1],3),
    uv:attr([0,0,1,0,0,1],2),
  },
};
describe("ARQDOR safe geometry export",()=>{
  it("exports a triangle without changing coordinates",()=>{
    const transfer=exportRenderGeometry(root({geometry}));
    expect(transfer.truncated).toBe(false);
    expect(transfer.totalTriangles).toBe(1);
    expect(transfer.meshes[0].positions).toEqual([0,0,0,1,0,0,0,1,0]);
  });
  it("rejects missing UV without silently producing inaccurate geometry",()=>{
    const transfer=exportRenderGeometry(root({geometry:{attributes:{position:geometry.attributes.position,normal:geometry.attributes.normal}}}));
    expect(transfer.truncated).toBe(true);
    expect(transfer.meshes).toHaveLength(0);
  });
  it("rejects singular transforms",()=>{
    const transfer=exportRenderGeometry(root({geometry,matrixWorld:{...matrix(),determinant:()=>0}}));
    expect(transfer.truncated).toBe(true);
  });
  it("rejects missing positions and unsupported instances",()=>{
    expect(exportRenderGeometry(root({geometry:{attributes:{}}})).truncated).toBe(true);
    expect(exportRenderGeometry(root({geometry,isInstancedMesh:true})).truncated).toBe(true);
  });
  it("enforces triangle budgets",()=>{
    const transfer=exportRenderGeometry(root({geometry}),{maxTriangles:0});
    expect(transfer.totalTriangles).toBe(1); // current API clamps budget to one triangle
    expect(transfer.truncated).toBe(false);
  });
});
