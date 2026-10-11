import {describe,expect,it} from "vitest";
import {prepareCpuPreview} from "./render-cpu-preview";
import {renderDiffusePreviewStrip} from "./render-diffuse-preview";
import type {GeometryTransfer} from "./render-geometry-export";
const geometry:GeometryTransfer={schemaVersion:1,meshes:[],totalTriangles:0,truncated:false,warnings:[]};
const options={geometry,width:4,height:4,camera:{position:[0,0,2] as const,target:[0,0,0] as const,verticalFovDegrees:60},light:{directionToLight:[0,0,1] as const,intensity:1,color:[1,1,1] as const},materials:{},skyColor:[0.2,0.4,0.6] as const};
describe("ARQDOR experimental diffuse preview",()=>{
 it("preserves full-frame output when rendered in strips",()=>{
   const bvh=prepareCpuPreview(geometry);
   const whole=renderDiffusePreviewStrip(options,0,4,bvh,0);
   const upper=renderDiffusePreviewStrip(options,0,2,bvh,0);
   const lower=renderDiffusePreviewStrip(options,2,2,bvh,0);
   expect([...upper,...lower]).toEqual(Array.from(whole));
   expect(Array.from(whole.slice(0,4))).toEqual([51,102,153,255]);
 });
 it("rejects invalid sampling bounds",()=>{
   expect(()=>renderDiffusePreviewStrip(options,3,2,prepareCpuPreview(geometry),0)).toThrow();
 });
 it("rejects partial geometry during BVH preparation",()=>{
   expect(()=>prepareCpuPreview({...geometry,truncated:true})).toThrow();
 });
});
