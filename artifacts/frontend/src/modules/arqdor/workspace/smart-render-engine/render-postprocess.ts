import type { Vec3 } from "./render-bvh";

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export type ToneMapping="none"|"reinhard"|"aces";
export function encodeDisplayColor(linear:Vec3,exposure=1,tone:ToneMapping="aces"):Vec3 {
 if(!Number.isFinite(exposure)||exposure<=0||exposure>64||
    linear.some(x=>!Number.isFinite(x)||x<0))throw Error("ARQDOR: cor ou exposição inválida");
 const map=(v:number)=>{
  const x=v*exposure;
  if(tone==="none")return clamp(x);
  if(tone==="reinhard")return x/(1+x);
  if(tone==="aces")return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14));
  throw Error("ARQDOR: tone mapping inválido");
 };
 return linear.map(c=>{const v=map(c);return v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055;}) as unknown as Vec3;
}
/** Bounded 3x3 luma-aware CPU filter for preview only; not production path-tracing denoising. */
export function denoisePreviewRgba(rgba:Uint8ClampedArray,width:number,height:number,strength=0.5):Uint8ClampedArray {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262144||
 rgba.length!==width*height*4||!Number.isFinite(strength)||strength<0||strength>1)
  throw Error("ARQDOR: parâmetros de denoise inválidos");
 if(strength===0)return rgba.slice();
 const out=rgba.slice(),luma=(i:number)=>0.2126*rgba[i]+0.7152*rgba[i+1]+0.0722*rgba[i+2];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4,ref=luma(p);
  const rgb=[0,0,0],limit=12+strength*36;
  let sum=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=x+dx,yy=y+dy;
   if(xx<0||xx>=width||yy<0||yy>=height)continue;
   const i=(yy*width+xx)*4,delta=luma(i)-ref;
   const spatial=dx===0&&dy===0?2:(dx===0||dy===0?1:0.7);
   const weight=spatial*Math.exp(-(delta*delta)/(2*limit*limit));
   for(let c=0;c<3;c++)rgb[c]+=rgba[i+c]*weight;
   sum+=weight;
  }
  for(let c=0;c<3;c++)out[p+c]=Math.round(rgba[p+c]*(1-strength)+rgb[c]/sum*strength);
 }
 return out;
}
