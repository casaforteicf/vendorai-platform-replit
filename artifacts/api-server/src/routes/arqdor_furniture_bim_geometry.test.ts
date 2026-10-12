import {describe,it,expect} from "vitest";
import {validateBimFurnitureFootprints} from "./arqdor_furniture_bim_geometry.js";
const geometry={schemaVersion:1,source:"bim-server",revision:"rev-1",rooms:{room:{outline:[{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}],exclusions:[{id:"door",xMm:0,yMm:700,widthMm:900,depthMm:900}]}}};
const box=(xMm:number,yMm:number)=>({xMm,yMm,widthMm:500,depthMm:500,rotationDeg:0});
describe("authoritative BIM furniture checks",()=>{
 it("allows furniture within official room",()=>expect(validateBimFurnitureFootprints(geometry,"room",[box(2000,1000)])).toEqual({ok:true,revision:"rev-1"}));
 it("rejects door exclusion",()=>expect(validateBimFurnitureFootprints(geometry,"room",[box(100,800)])).toMatchObject({ok:false,reason:"excluded-zone"}));
 it("rejects positions outside official room",()=>expect(validateBimFurnitureFootprints(geometry,"room",[box(3900,2000)])).toMatchObject({ok:false,reason:"out-of-room"}));
 it("rejects missing room and untrusted source",()=>{
  expect(validateBimFurnitureFootprints(geometry,"other",[])).toMatchObject({ok:false,reason:"missing-room"});
  expect(validateBimFurnitureFootprints({...geometry,source:"browser"},"room",[])).toMatchObject({ok:false,reason:"invalid-geometry"});
 });
 it("rejects repeated vertices in room outlines",()=>{
  const invalid={...geometry,rooms:{room:{...geometry.rooms.room,outline:[
   {xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000},{xMm:4000,yMm:0}
  ]}}};
  expect(validateBimFurnitureFootprints(invalid,"room",[])).toMatchObject({ok:false,reason:"invalid-outline"});
 });
 it("rejects degenerate room edges",()=>{
  const invalid={...geometry,rooms:{room:{...geometry.rooms.room,outline:[
   {xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:0.2},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}
  ]}}};
  expect(validateBimFurnitureFootprints(invalid,"room",[])).toMatchObject({ok:false,reason:"invalid-outline"});
 });
});
