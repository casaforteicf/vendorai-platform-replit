import {describe,it,expect} from "vitest";
import {buildFurnitureSceneNodes} from "./furniture-scene-nodes";
import {generateCabinetDraft} from "./parametric-cabinet-core";
import {insertCabinetDraft,revisePlacedCabinet} from "./placed-cabinet-draft";
const room={id:"room",widthMm:5000,depthMm:4500};
const params={tenantId:"tenant",projectId:"project",roomId:"room",furnitureId:"template",widthMm:1200,heightMm:2100,depthMm:600,panelThicknessMm:18,shelfCount:1,doorCount:2,materialId:"MDF",backThicknessMm:6,backMaterialId:"HDF"};
describe("Furniture scene adapter",()=>{
 it("uses meters, stable identity and follows cabinet revisions",()=>{
  const first=insertCabinetDraft({tenantId:"tenant",projectId:"project",room,draft:generateCabinetDraft(params),xMm:200,yMm:300,id:"cab1",existing:[]});
  const a=buildFurnitureSceneNodes(first)[0];
  expect(a).toMatchObject({id:"furniture:project:room:cab1",furnitureId:"cab1",positionM:{x:.8,y:1.05,z:.6},sizeM:{x:1.2,y:2.1,z:.6}});
  const edited=revisePlacedCabinet({room,items:first,id:"cab1",changes:{heightMm:2400,materialId:"Wood"}});
  const b=buildFurnitureSceneNodes(edited)[0];
  expect(b.id).toBe(a.id);expect(b.sizeM.y).toBe(2.4);expect(b.materialId).toBe("Wood");
 });
});
