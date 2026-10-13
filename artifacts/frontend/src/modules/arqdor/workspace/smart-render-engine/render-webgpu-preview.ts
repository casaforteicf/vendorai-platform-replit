import type { DiffusePreviewOptions } from "./render-diffuse-preview";

/** WebGPU triangle raycast proof of concept: directional Lambert + hard shadows are NOT
 * implemented yet (primary visibility and directional diffuse only).
 * Experimental diagnostic, not a physically based or production renderer.
 */
const SHADER = `
struct Params {
 camera: vec4<f32>,
 forward: vec4<f32>,
 right: vec4<f32>,
 up: vec4<f32>,
 sunlight: vec4<f32>,
 sky: vec4<f32>,
 dims: vec4<f32>,
};
@group(0) @binding(0) var<storage, read> triangles: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> colors: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> pixels: array<u32>;
@group(0) @binding(3) var<uniform> p: Params;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
 let w=u32(p.dims.x); let h=u32(p.dims.y);
 if(gid.x>=w || gid.y>=h) { return; }
 let aspect=p.dims.x/p.dims.y;
 let spread=p.dims.z;
 let px=(2.0*(f32(gid.x)+0.5)/p.dims.x-1.0)*aspect*spread;
 let py=(1.0-2.0*(f32(gid.y)+0.5)/p.dims.y)*spread;
 let ray=normalize(p.forward.xyz+px*p.right.xyz+py*p.up.xyz);
 let origin=p.camera.xyz;
 var nearest=1e30;
 var rgb=p.sky.xyz;
 let count=u32(p.dims.w);
 for(var t:u32=0u;t<count;t=t+1u){
   let a=triangles[t*3u].xyz;
   let b=triangles[t*3u+1u].xyz;
   let c=triangles[t*3u+2u].xyz;
   let e1=b-a;let e2=c-a;let q=cross(ray,e2);
   let det=dot(e1,q);
   if(abs(det)<0.000001){continue;}
   let inv=1.0/det;let s=origin-a;
   let u=dot(s,q)*inv;
   if(u<0.0 || u>1.0){continue;}
   let v=dot(ray,cross(s,e1))*inv;
   if(v<0.0 || u+v>1.0){continue;}
   let dist=dot(e2,cross(s,e1))*inv;
   if(dist>0.0001 && dist<nearest){
      nearest=dist;
      var n=normalize(cross(e1,e2));
      if(dot(n,ray)>0.0){n=-n;}
      let diffuse=max(dot(n,normalize(p.sunlight.xyz)),0.0)*p.sunlight.w;
      rgb=colors[t].xyz*clamp(0.16+diffuse,0.0,1.0);
   }
 }
 let v=vec3<u32>(clamp(rgb,vec3<f32>(0.0),vec3<f32>(1.0))*255.0+0.5);
 pixels[gid.y*w+gid.x]=v.x | (v.y<<8u) | (v.z<<16u) | (255u<<24u);
}
`;

type GpuBufferLike = { destroy(): void; mapAsync(mode:number):Promise<void>; getMappedRange():ArrayBuffer; unmap():void };
type GpuDeviceLike = any;
const unit=(v:readonly number[])=>{const d=Math.hypot(...v);if(!Number.isFinite(d)||d<1e-9)throw Error("ARQDOR: vetor inválido");return v.map(x=>x/d);};
const cross=(a:readonly number[],b:readonly number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export async function renderWebGpuPreview(o:DiffusePreviewOptions):Promise<Uint8ClampedArray> {
 const {width,height,geometry}=o;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262144)
   throw Error("ARQDOR: resolução WebGPU fora do limite experimental");
 if(geometry.truncated || geometry.totalTriangles<1 || geometry.totalTriangles>512 || !Number.isSafeInteger(geometry.totalTriangles))
   throw Error("ARQDOR: GPU experimental aceita apenas cenas completas de 1 a 512 triângulos");
 if(geometry.meshes.reduce((count,mesh)=>count+mesh.triangles,0)!==geometry.totalTriangles)
   throw Error("ARQDOR: contagem de triângulos inconsistente");
 if(geometry.meshes.some(mesh=>!Number.isSafeInteger(mesh.triangles)||mesh.triangles<0||mesh.positions.length!==mesh.triangles*9||mesh.positions.some(v=>!Number.isFinite(v))))
   throw Error("ARQDOR: geometria inválida");
 if(!(o.camera.verticalFovDegrees>1&&o.camera.verticalFovDegrees<179))throw Error("ARQDOR: FOV inválido");
 if(typeof navigator==="undefined" || typeof window==="undefined" || !window.isSecureContext)
   throw Error("ARQDOR: WebGPU exige navegador e contexto seguro");
 const gpu=(navigator as any).gpu;
 if(!gpu?.requestAdapter)throw Error("ARQDOR: WebGPU indisponível");
 const adapter=await gpu.requestAdapter({powerPreference:"high-performance"});
 if(!adapter)throw Error("ARQDOR: adaptador GPU indisponível");
 const device:GpuDeviceLike=await adapter.requestDevice();
 const buffers:GpuBufferLike[]=[];
 const create=(size:number,flags:number):GpuBufferLike=>{
   const b=device.createBuffer({size:Math.ceil(size/4)*4,usage:flags});
   buffers.push(b);return b;
 };
 try {
   const usage=(globalThis as any).GPUBufferUsage;
   const mapMode=(globalThis as any).GPUMapMode;
   if(!usage||!mapMode)throw Error("ARQDOR: API WebGPU incompleta");
   const verts:number[]=[];const cols:number[]=[];
   let actualTriangles=0;
   for(const mesh of geometry.meshes) {
     const hex=o.materials[mesh.materialId??""]??"#bdbdbd";
     const rgb=/^#[0-9a-f]{6}$/i.test(hex)?[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255):[0.75,0.75,0.75];
     if(!Number.isSafeInteger(mesh.triangles)||mesh.triangles<0||mesh.positions.length!==mesh.triangles*9)throw Error("ARQDOR: malha incompleta");
     actualTriangles+=mesh.triangles;
     for(let t=0;t<mesh.triangles;t++){
       for(let v=0;v<3;v++){const at=t*9+v*3;verts.push(...mesh.positions.slice(at,at+3),0);}
       cols.push(...rgb,1);
     }
   }
   if(actualTriangles!==geometry.totalTriangles)throw Error("ARQDOR: contagem de triângulos inconsistente");
   if(verts.some(v=>!Number.isFinite(v)))throw Error("ARQDOR: geometria inválida");
   const forward=unit(o.camera.target.map((v,i)=>v-o.camera.position[i]));
   const right=unit(cross(forward,o.camera.up??[0,1,0]));
   const up=unit(cross(right,forward));
   const sun=unit(o.directionalLight?.directionToLight??o.light.directionToLight);
   const intensity=o.directionalLight?.intensity??o.light.intensity;
   if(!Number.isFinite(intensity)||intensity<0)throw Error("ARQDOR: iluminação inválida");
   const params=new Float32Array([
     ...o.camera.position,0,...forward,0,...right,0,...up,0,
     ...sun,Math.max(0,intensity),
     ...(o.skyColor??[0.72,0.82,0.95]),0,
     width,height,Math.tan(o.camera.verticalFovDegrees*Math.PI/360),geometry.totalTriangles
   ]);
   if(params.some(v=>!Number.isFinite(v)))throw Error("ARQDOR: parâmetros da câmera ou luz inválidos");
   const vertsData=new Float32Array(verts),colorsData=new Float32Array(cols);
   const vb=create(vertsData.byteLength,usage.STORAGE|usage.COPY_DST);
   const cb=create(colorsData.byteLength,usage.STORAGE|usage.COPY_DST);
   const ub=create(params.byteLength,usage.UNIFORM|usage.COPY_DST);
   const pixelBytes=width*height*4;
   const out=create(pixelBytes,usage.STORAGE|usage.COPY_SRC);
   const read=create(pixelBytes,usage.COPY_DST|usage.MAP_READ);
   device.queue.writeBuffer(vb,0,vertsData);
   device.queue.writeBuffer(cb,0,colorsData);
   device.queue.writeBuffer(ub,0,params);
   const module=device.createShaderModule({code:SHADER});
   const shaderInfo=await module.getCompilationInfo();
   const shaderErrors=shaderInfo.messages.filter((m:{type:string})=>m.type==="error");
   if(shaderErrors.length)throw Error("ARQDOR: shader WGSL inválido: "+shaderErrors.map((m:{message:string})=>m.message).join("; "));
   const pipeline=device.createComputePipeline({layout:"auto",compute:{module,entryPoint:"main"}});
   const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
     {binding:0,resource:{buffer:vb}},{binding:1,resource:{buffer:cb}},
     {binding:2,resource:{buffer:out}},{binding:3,resource:{buffer:ub}}
   ]});
   const encoder=device.createCommandEncoder();
   const pass=encoder.beginComputePass();
   pass.setPipeline(pipeline);pass.setBindGroup(0,bind);
   pass.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));pass.end();
   encoder.copyBufferToBuffer(out,0,read,0,pixelBytes);
   device.queue.submit([encoder.finish()]);
   await read.mapAsync(mapMode.READ);

   const bytes=new Uint8ClampedArray(read.getMappedRange().slice(0));
   read.unmap();
   return bytes;
 }finally{for(const b of buffers)b.destroy();device.destroy?.();}
}
