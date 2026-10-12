import {describe,it,expect} from "vitest";
import {inspectSketch2D,moveSketchVertex,translateSketchFace,type Sketch2D} from "./sketch-subobjects-2d";
const original:Sketch2D={id:"s",tenantId:"t",projectId:"p",revision:"R1",vertices:[{id:"a",xMm:0,yMm:0},{id:"b",xMm:1000,yMm:0},{id:"c",xMm:1000,yMm:500},{id:"d",xMm:0,yMm:500}],faces:[{id:"f",vertexIds:["a","b","c","d"]}]};
describe("2D sketch subobjects",()=>{
 it("derives edges with stable face links",()=>{
  expect(inspectSketch2D(original)).toMatchObject({vertexCount:4,edgeCount:4,faceCount:1});
 });
 it("moves individual vertex without changing original",()=>{
  const changed=moveSketchVertex(original,"c",1200,500);
  expect(changed.vertices[2].xMm).toBe(1200);
  expect(original.vertices[2].xMm).toBe(1000);
 });
 it("translates an entire face",()=>{
  const next=translateSketchFace(original,"f",100,200);
  expect(next.vertices[0]).toMatchObject({xMm:100,yMm:200});
 });
 it("rejects degeneracy or unknown vertices",()=>{
  expect(()=>moveSketchVertex(original,"c",0,0)).toThrow();
  expect(()=>moveSketchVertex(original,"unknown",1,2)).toThrow();
 });
});