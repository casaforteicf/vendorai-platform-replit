import {describe,expect,it} from "vitest";
import {buildExperimentalRenderOptions} from "./render-scene-adapter";
import type {RenderSceneSnapshot} from "./render-scene-contract";
import type {GeometryTransfer} from "./render-geometry-export";
const snapshot:RenderSceneSnapshot={
 schemaVersion:1,capturedAt:"2026-10-11T00:00:00Z",sceneId:"room",geometryLocked:true,warnings:[],
 camera:{position:[0,0,4],target:[0,0,0],fov:50},
 meshes:[{id:"wall",materialIds:["paint"],triangleCount:1,worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],geometryType:"BufferGeometry"}],
 materials:[{id:"paint",baseColor:"#808080",metalness:0,roughness:0.8,opacity:1,doubleSided:false}],
};
const geometry:GeometryTransfer={schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
 meshes:[{meshId:"wall",materialId:"paint",triangles:1,
 positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}]};
describe("ARQDOR real scene adapter",()=>{
 it("preserves captured camera and matched geometry",()=>{
  const result=buildExperimentalRenderOptions({snapshot,geometry,width:64,height:48});
  expect(result.camera.position).toEqual([0,0,4]);
  expect(result.geometry).toBe(geometry);
  expect(result.physicalMaterials?.paint?.roughness).toBe(0.8);
  expect(result.directionalLight?.intensity).toBe(1);
  expect(result.physicalMaterials?.paint?.transmission).toBe(0);
  expect(result.physicalMaterials?.paint?.baseColor?.[0]).toBeCloseTo(0.21586,4);
 });
 it("rejects material IDs that were not captured on the corresponding mesh",()=>{
  const extra={...snapshot,materials:[...snapshot.materials,
    {id:"other",baseColor:"#ffffff",metalness:0,roughness:1,opacity:1,doubleSided:false}]};
  const mismatched={...geometry,meshes:[{...geometry.meshes[0],materialId:"other"}]};
  expect(()=>buildExperimentalRenderOptions({snapshot:extra,geometry:mismatched})).toThrow();
 });
 it("maps alpha to lab-only approximate transmission",()=>{
  const translucent={...snapshot,materials:[{...snapshot.materials[0],opacity:0.25}]};
  const result=buildExperimentalRenderOptions({snapshot:translucent,geometry});
  expect(result.physicalMaterials?.paint?.transmission).toBeCloseTo(0.75);
 });
 it("rejects out-of-range physically based material parameters",()=>{
  const invalid={...snapshot,materials:[{...snapshot.materials[0],roughness:-0.1}]};
  expect(()=>buildExperimentalRenderOptions({snapshot:invalid,geometry})).toThrow();
 });
 it("rejects incomplete or mismatched geometry rather than constructing fake surfaces",()=>{
  expect(()=>buildExperimentalRenderOptions({snapshot,geometry:{...geometry,truncated:true}})).toThrow();
  expect(()=>buildExperimentalRenderOptions({snapshot,geometry:{...geometry,meshes:[]}})).toThrow();
  expect(()=>buildExperimentalRenderOptions({snapshot:{...snapshot,warnings:["invalid"]},geometry})).toThrow();
 });
});
