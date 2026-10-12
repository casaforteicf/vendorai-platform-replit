import {describe,expect,it} from "vitest";
import {encodeDisplayColor,denoisePreviewRgba} from "./render-postprocess";
describe("ARQDOR experimental postprocessing",()=>{
 it("encodes linear color with sRGB transfer and configurable tone map",()=>{
  const c=encodeDisplayColor([0.21404114,0.21404114,0.21404114],1,"none");
  expect(c[0]).toBeCloseTo(0.5,5);
  expect(encodeDisplayColor([2,0,0],1,"reinhard")[0]).toBeLessThan(1);
 });
 it("rejects invalid radiance and exposure",()=>{
  expect(()=>encodeDisplayColor([NaN,0,0])).toThrow();
  expect(()=>encodeDisplayColor([1,1,1],-1)).toThrow();
 });
 it("leaves the input unchanged when denoising is disabled",()=>{
  const original=new Uint8ClampedArray([20,30,40,255,200,210,220,255]);
  const output=denoisePreviewRgba(original,2,1,0);
  expect([...output]).toEqual([...original]);expect(output).not.toBe(original);
 });
 it("preserves alpha and reduces isolated pixel noise",()=>{
  const pixels=new Uint8ClampedArray(3*3*4).fill(0);
  for(let i=0;i<9;i++){pixels[i*4]=100;pixels[i*4+1]=100;pixels[i*4+2]=100;pixels[i*4+3]=255;}
  pixels[16]=135;pixels[17]=135;pixels[18]=135;
  const out=denoisePreviewRgba(pixels,3,3,1);
  expect(out[16]).toBeLessThan(135);
  expect(out[19]).toBe(255);
  expect(pixels[16]).toBe(135);
 });
});
