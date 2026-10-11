import {describe,it,expect} from "vitest";
import {generateCabinetDraft} from "./parametric-cabinet-core";
import {insertCabinetDraft} from "./placed-cabinet-draft";
import {createFurnitureSnapshot,restoreFurnitureSnapshot} from "./furniture-project-snapshot";
const room={id:"room",widthMm:5000,depthMm:4000};
const draft=generateCabinetDraft({tenantId:"t",projectId:"p",roomId:"room",furnitureId:"template",widthMm:1200,heightMm:2200,depthMm:600,panelThicknessMm:18,shelfCount:2,doorCount:2,materialId:"mdf",backThicknessMm:6,backMaterialId:"back"});
const furniture=insertCabinetDraft({tenantId:"t",projectId:"p",room,draft,xMm:100,yMm:100,id:"c1",existing:[]});
const base={tenantId:"t",projectId:"p",room,revision:"R1",createdAt:"2026-10-11T12:00:00Z",furniture};
describe("C04 furniture snapshot contract",()=>{
 it("roundtrips validated project furniture without aliasing objects",()=>{
  const snapshot=createFurnitureSnapshot(base);
  expect(restoreFurnitureSnapshot(JSON.parse(JSON.stringify(snapshot)),{tenantId:"t",projectId:"p",room}).furniture[0].parts.length).toBeGreaterThan(0);
  expect(snapshot.furniture[0].parts[0]).not.toBe(furniture[0].parts[0]);
 });
 it("rejects cross tenant restores and out-of-room footprints",()=>{
  const snapshot=createFurnitureSnapshot(base);
  expect(()=>restoreFurnitureSnapshot(snapshot,{tenantId:"other",projectId:"p",room})).toThrow();
  expect(()=>createFurnitureSnapshot({...base,furniture:[{...furniture[0],bounds:{...furniture[0].bounds,xMm:4999}}]})).toThrow();
 });
 it("rejects mismatched room context even with matching tenant",()=>{
  const snapshot=createFurnitureSnapshot(base);
  expect(()=>restoreFurnitureSnapshot(snapshot,{tenantId:"t",projectId:"p",room:{id:"other",widthMm:5000,depthMm:4000}})).toThrow();
 });
 it("rejects snapshots where a part points at another cabinet",()=>{
  const corrupted={...furniture[0],parts:[{...furniture[0].parts[0],furnitureId:"other"}]};
  expect(()=>createFurnitureSnapshot({...base,furniture:[corrupted]})).toThrow();
 });
});
