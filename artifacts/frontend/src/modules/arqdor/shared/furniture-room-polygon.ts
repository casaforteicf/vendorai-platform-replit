import type {FurnitureBounds} from "./furniture-placement-2d";
export type PointMm={x:number;y:number};
export type SegmentMm={a:PointMm;b:PointMm};
const cross=(a:PointMm,b:PointMm,c:PointMm)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const onEdge=(p:PointMm,a:PointMm,b:PointMm)=>Math.abs(cross(a,b,p))<.01&&p.x>=Math.min(a.x,b.x)-.01&&p.x<=Math.max(a.x,b.x)+.01&&p.y>=Math.min(a.y,b.y)-.01&&p.y<=Math.max(a.y,b.y)+.01;
const intersects=(a:PointMm,b:PointMm,c:PointMm,d:PointMm)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
/** Reconstruct a closed simple floor outline from architectural wall endpoints, in millimeters.
 * Refuses gaps, branches, duplicated edges and self-intersections.
 */
export function closedRoomPolygon(segments:readonly SegmentMm[]):PointMm[]|null{
 if(segments.length<3||segments.length>500)return null;
 const key=(p:PointMm)=>p.x+","+p.y;
 const edges=new Map<string,string[]>(),points=new Map<string,PointMm>();
 for(const s of segments){
  if(!s||![s.a?.x,s.a?.y,s.b?.x,s.b?.y].every(Number.isFinite))return null;
  const a=key(s.a),b=key(s.b);
  if(a===b||Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)<1)return null;
  points.set(a,s.a);points.set(b,s.b);
  edges.set(a,[...(edges.get(a)??[]),b]);edges.set(b,[...(edges.get(b)??[]),a]);
 }
 if(points.size!==segments.length||[...edges.values()].some(e=>e.length!==2||e[0]===e[1]))return null;
 const first=key(segments[0].a),ordered:string[]=[first];
 let prev="",current=first;
 for(let i=0;i<segments.length;i++){
  const adjacent=edges.get(current)!;
  const next=adjacent[0]===prev?adjacent[1]:adjacent[0];
  if(next===first){if(i!==segments.length-1)return null;break;}
  if(ordered.includes(next))return null;
  ordered.push(next);prev=current;current=next;
 }
 if(ordered.length!==segments.length)return null;
 const polygon=ordered.map(k=>points.get(k)!);
 const area=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.x*q.y-p.y*q.x;},0);
 if(Math.abs(area)<1)return null;
 for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){
  if(j===i+1||(i===0&&j===polygon.length-1))continue;
  if(intersects(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))return null;
 }
 return polygon;
}
export function pointInsideRoom(point:PointMm,polygon:readonly PointMm[]):boolean{
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if(onEdge(point,a,b))return true;
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
export function furnitureInsidePolygon(bounds:FurnitureBounds,polygon:readonly PointMm[]):boolean{
 if(polygon.length<3)return false;
 const w=bounds.rotationDeg===90||bounds.rotationDeg===270?bounds.depthMm:bounds.widthMm;
 const d=bounds.rotationDeg===90||bounds.rotationDeg===270?bounds.widthMm:bounds.depthMm;
 if(![bounds.xMm,bounds.yMm,w,d].every(Number.isFinite)||w<=0||d<=0)return false;
 const corners=[{x:bounds.xMm,y:bounds.yMm},{x:bounds.xMm+w,y:bounds.yMm},{x:bounds.xMm+w,y:bounds.yMm+d},{x:bounds.xMm,y:bounds.yMm+d}];
 if(!corners.every(p=>pointInsideRoom(p,polygon)))return false;
 for(let i=0;i<4;i++)for(let j=0;j<polygon.length;j++){
  if(intersects(corners[i],corners[(i+1)%4],polygon[j],polygon[(j+1)%polygon.length]))return false;
 }
 return true;
}
