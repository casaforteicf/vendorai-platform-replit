import {describe,expect,it} from "vitest";
import {sampleRoughnessMap,sampleWorldNormalMap} from "./render-material-maps";
const texture={width:1,height:1,channels:3 as const,wrap:"clamp" as const,data:[0.5,0.5,1]};
const plane={positions:[0,0,0,1,0,0,0,1,0],uvs:[0,0,1,0,0,1],triangle:0,faceNormal:[0,0,1] as const,uv:[0.2,0.3] as const};
describe("ARQDOR physical maps",()=>{
 it("multiplies roughness by texture red channel",()=>expect(sampleRoughnessMap(texture,[0.2,0.3],0.8)).toBeCloseTo(0.4));
 it("preserves plane normal for a neutral tangent-space map",()=>{
  const n=sampleWorldNormalMap({...plane,texture});
  expect(n[0]).toBeCloseTo(0);
  expect(n[1]).toBeCloseTo(0);
  expect(n[2]).toBeCloseTo(1);
 });
 it("rejects missing tangents for degenerate UVs",()=>{
  expect(()=>sampleWorldNormalMap({...plane,uvs:[0,0,0,0,0,0],texture})).toThrow();
 });
});
