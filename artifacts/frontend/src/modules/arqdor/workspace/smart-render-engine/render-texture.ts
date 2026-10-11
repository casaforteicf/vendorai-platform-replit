import type { Vec3 } from "./render-bvh";

export type CpuTexture = Readonly<{
 width:number; height:number; channels:3|4;
 data:readonly number[]; // decoded, normalized RGB(A), row-major
 wrap:"repeat"|"clamp";
 filter?:"nearest"|"bilinear";
 colorSpace?:"linear"|"srgb";
}>;
const fract=(v:number)=>v-Math.floor(v);
export function sampleCpuTexture(texture:CpuTexture, uv:readonly [number,number]):Vec3 {
 const {width,height,channels,data,wrap}=texture;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||
    width*height>4_194_304||data.length!==width*height*channels||
    ![uv[0],uv[1]].every(Number.isFinite) ||
    data.some(x=>!Number.isFinite(x)||x<0||x>1))
   throw Error("ARQDOR: textura CPU inválida");
 const address=(n:number)=>wrap==="repeat"?fract(n):Math.max(0,Math.min(1,n));
 const toLinear=(n:number)=>texture.colorSpace==="srgb"?(n<=0.04045?n/12.92:Math.pow((n+0.055)/1.055,2.4)):n;
 const read=(x:number,y:number):Vec3=>{
   const ix=wrap==="repeat"?((x%width)+width)%width:Math.max(0,Math.min(width-1,x));
   const iy=wrap==="repeat"?((y%height)+height)%height:Math.max(0,Math.min(height-1,y));
   const offset=(iy*width+ix)*channels;
   return [toLinear(data[offset]),toLinear(data[offset+1]),toLinear(data[offset+2])];
 };
 const u=address(uv[0]),v=address(uv[1]);
 if(texture.filter!=="bilinear"){
   return read(Math.min(width-1,Math.floor(u*width)),Math.min(height-1,Math.floor((1-v)*height)));
 }
 const fx=u*width-0.5,fy=(1-v)*height-0.5;
 const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;
 const a=read(x0,y0),b=read(x0+1,y0),c=read(x0,y0+1),d=read(x0+1,y0+1);
 return [0,1,2].map(k=>(a[k]*(1-tx)+b[k]*tx)*(1-ty)+(c[k]*(1-tx)+d[k]*tx)*ty) as unknown as Vec3;
}
export function sampleMeshUv(uvs:readonly number[],triangle:number,barycentric:Vec3):readonly [number,number] {
 const i=triangle*6;
 if(!Number.isSafeInteger(triangle)||triangle<0||i+5>=uvs.length)
   throw Error("ARQDOR: triângulo sem UV");
 return [
  uvs[i]*barycentric[0]+uvs[i+2]*barycentric[1]+uvs[i+4]*barycentric[2],
  uvs[i+1]*barycentric[0]+uvs[i+3]*barycentric[1]+uvs[i+5]*barycentric[2],
 ];
}
