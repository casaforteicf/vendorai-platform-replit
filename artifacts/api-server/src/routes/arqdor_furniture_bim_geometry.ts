import {z} from "zod/v4";
const finite=z.number().finite();
const point=z.object({xMm:finite,yMm:finite}).strict();
const zone=z.object({id:z.string().min(1).max(160),xMm:finite,yMm:finite,widthMm:finite.positive(),depthMm:finite.positive()}).strict();
export const authoritativeFurnitureGeometry=z.object({
 schemaVersion:z.literal(1),source:z.literal("bim-server"),revision:z.string().min(1).max(160),
 rooms:z.record(z.string(),z.object({outline:z.array(point).min(3).max(500),exclusions:z.array(zone).max(500)}).strict())
}).strict();
type Point=z.infer<typeof point>;
function cross(a:Point,b:Point,c:Point){return (b.xMm-a.xMm)*(c.yMm-a.yMm)-(b.yMm-a.yMm)*(c.xMm-a.xMm);}
function inside(p:Point,outline:Point[]){
 let value=false;
 for(let i=0,j=outline.length-1;i<outline.length;j=i++){
  const a=outline[i],b=outline[j];
  if(Math.abs(cross(a,b,p))<0.001&&p.xMm>=Math.min(a.xMm,b.xMm)&&p.xMm<=Math.max(a.xMm,b.xMm)&&p.yMm>=Math.min(a.yMm,b.yMm)&&p.yMm<=Math.max(a.yMm,b.yMm))return true;
  if((a.yMm>p.yMm)!==(b.yMm>p.yMm)&&p.xMm<(b.xMm-a.xMm)*(p.yMm-a.yMm)/(b.yMm-a.yMm)+a.xMm)value=!value;
 }
 return value;
}
function intersects(a:Point,b:Point,c:Point,d:Point){
 const v=cross(a,b,c),w=cross(a,b,d),x=cross(c,d,a),y=cross(c,d,b);
 return v*w<0&&x*y<0;
}
export function validateBimFurnitureFootprints(raw:unknown,roomId:string,items:readonly {xMm:number;yMm:number;widthMm:number;depthMm:number;rotationDeg:number}[]){
 const parsed=authoritativeFurnitureGeometry.safeParse(raw);
 if(!parsed.success)return {ok:false,reason:"invalid-geometry"} as const;
 const room=parsed.data.rooms[roomId];
 if(!room)return {ok:false,reason:"missing-room"} as const;
 const polygon=room.outline;
 // Reject repeated vertices and degenerate edges before checking furniture.
 const vertexKeys=new Set<string>();
 for(let i=0;i<polygon.length;i++){
  const p=polygon[i],next=polygon[(i+1)%polygon.length];
  const key=p.xMm+":"+p.yMm;
  if(vertexKeys.has(key)||Math.hypot(next.xMm-p.xMm,next.yMm-p.yMm)<1)return {ok:false,reason:"invalid-outline"} as const;
  vertexKeys.add(key);
 }
 const area=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.xMm*q.yMm-p.yMm*q.xMm;},0);
 if(Math.abs(area)<1)return {ok:false,reason:"invalid-outline"} as const;
 for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){
  if(j===i+1||(i===0&&j===polygon.length-1))continue;
  if(intersects(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))return {ok:false,reason:"invalid-outline"} as const;
 }
 for(const f of items){
  const rotated=f.rotationDeg===90||f.rotationDeg===270;
  const w=rotated?f.depthMm:f.widthMm,h=rotated?f.widthMm:f.depthMm;
  const corners=[{xMm:f.xMm,yMm:f.yMm},{xMm:f.xMm+w,yMm:f.yMm},{xMm:f.xMm+w,yMm:f.yMm+h},{xMm:f.xMm,yMm:f.yMm+h}];
  if(!corners.every(p=>inside(p,polygon)))return {ok:false,reason:"out-of-room"} as const;
  for(let i=0;i<4;i++)for(let j=0;j<polygon.length;j++)if(intersects(corners[i],corners[(i+1)%4],polygon[j],polygon[(j+1)%polygon.length]))return {ok:false,reason:"crosses-wall"} as const;
  for(const x of room.exclusions)if(f.xMm<x.xMm+x.widthMm&&f.xMm+w>x.xMm&&f.yMm<x.yMm+x.depthMm&&f.yMm+h>x.yMm)return {ok:false,reason:"excluded-zone"} as const;
 }
 return {ok:true,revision:parsed.data.revision} as const;
}
