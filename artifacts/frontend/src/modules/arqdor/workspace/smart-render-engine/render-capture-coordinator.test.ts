import { describe, expect, it } from "vitest";
import { createRenderCaptureCoordinator } from "./render-capture-coordinator";
import type { RenderSceneSnapshot } from "./render-scene-contract";
import type { GeometryTransfer } from "./render-geometry-export";
const snapshot:RenderSceneSnapshot={
 schemaVersion:1,capturedAt:"2026-10-11T00:00:00Z",sceneId:"test",geometryLocked:true,warnings:[],
 camera:{position:[0,0,3],target:[0,0,0],fov:50},
 meshes:[{id:"mesh",materialIds:["m"],triangleCount:1,worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],geometryType:"BufferGeometry"}],
 materials:[{id:"m",baseColor:"#ffffff",metalness:0,roughness:1,opacity:1,doubleSided:false}],
};
const geometry:GeometryTransfer={schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
 meshes:[{meshId:"mesh",materialId:"m",triangles:1,positions:[0,0,0,1,0,0,0,1,0],
 normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}]};
describe("ARQDOR paired capture coordinator",()=>{
 it("only returns options after both callbacks of the same capture",()=>{
  const coordinator=createRenderCaptureCoordinator();
  const token=coordinator.begin().renderSceneSnapshotToken;
  expect(coordinator.acceptSnapshot(token,snapshot)).toBe(true);
  expect(coordinator.consume(token)).toBeNull();
  expect(coordinator.acceptGeometry(token,geometry)).toBe(true);
  expect(coordinator.consume(token)?.geometry).toBe(geometry);
  expect(coordinator.consume(token)).toBeNull();
 });
 it("ignores callbacks from superseded requests",()=>{
  const c=createRenderCaptureCoordinator();
  const older=c.begin().renderGeometryExportToken;
  const newer=c.begin().renderGeometryExportToken;
  expect(c.acceptGeometry(older,geometry)).toBe(false);
  expect(c.acceptSnapshot(newer,snapshot)).toBe(true);
  expect(c.consume(newer)).toBeNull();
 });
 it("reports errors rather than using partially captured geometry",()=>{
  const c=createRenderCaptureCoordinator(),token=c.begin().renderGeometryExportToken;
  c.acceptGeometry(token,geometry);
  c.fail(token,"falha no modelo");
  expect(()=>c.consume(token)).toThrow("falha no modelo");
 });
});
