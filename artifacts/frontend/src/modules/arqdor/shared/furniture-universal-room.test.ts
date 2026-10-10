import {describe,it,expect} from "vitest";
import {duplicateRoomObject,mirrorRoomObject,prepareRoomQuoteReference,validateRoomObjects,type RoomObject} from "./furniture-universal-room";
const object:RoomObject={id:"desk",tenantId:"t",projectId:"p",roomId:"r",specialty:"cabinetry",kind:"panel",label:"Balcão",xMm:100,yMm:200,widthMm:1000,depthMm:600,rotationDeg:0,manufacturingMode:"custom"};
describe("universal furniture room",()=>{
 it("groups mixed specialties without implying manufacturing",()=>{
  const items=[object,{...object,id:"fridge",kind:"purchased" as const,specialty:"appliance" as const,manufacturingMode:"purchased" as const,manufacturer:"Brand",sku:"SKU"}];
  expect(validateRoomObjects(items,"t","p","r")).toMatchObject({objectCount:2,purchasedCount:1,status:"design-reference"});
  expect(prepareRoomQuoteReference(items,"t","p","r","R2")).toMatchObject({revision:"R2",status:"draft-needs-approval"});
 });
 it("duplicates and mirrors only chosen object",()=>{
  const duplicated=duplicateRoomObject([object],"desk","desk-copy",1200,0);
  expect(duplicated[1]).toMatchObject({id:"desk-copy",xMm:1300});
  const mirrored=mirrorRoomObject(duplicated,"desk-copy",1500);
  expect(mirrored[1].xMm).toBe(700);
  expect(mirrored[0].xMm).toBe(100);
 });
 it("rejects private cross tenant data and unidentified purchased products",()=>{
  expect(()=>validateRoomObjects([object],"other","p","r")).toThrow();
  expect(()=>validateRoomObjects([{...object,manufacturingMode:"purchased"}],"t","p","r")).toThrow();
 });
});