/** ARQDOR 13.59-13.60: immutable 2D vertices/edges/faces primitives.
 * No B-rep, booleans, solid extrusion or manufacturing claims.
 */
export type SketchVertex={id:string;xMm:number;yMm:number};
export type SketchFace={id:string;vertexIds:string[]};
export type Sketch2D={id:string;tenantId:string;projectId:string;revision:string;vertices:SketchVertex[];faces:SketchFace[]};
export type SketchEdge={id:string;faceId:string;from:string;to:string};
export function inspectSketch2D(s:Sketch2D){
 if(!s.id||!s.tenantId||!s.projectId||!s.revision)throw Error("Sketch scope required");
 const map=new Map(s.vertices.map(v=>[v.id,v]));
 if(map.size!==s.vertices.length||s.vertices.some(v=>!v.id||!Number.isFinite(v.xMm)||!Number.isFinite(v.yMm)))throw Error("Invalid vertices");
 const faces=new Set<string>(),edges:SketchEdge[]=[];
 for(const face of s.faces){
  if(!face.id||faces.has(face.id)||face.vertexIds.length<3||face.vertexIds.length>10000||new Set(face.vertexIds).size!==face.vertexIds.length||face.vertexIds.some(id=>!map.has(id)))throw Error("Invalid face");
  faces.add(face.id);
  let twice=0;
  for(let i=0;i<face.vertexIds.length;i++){
   const a=map.get(face.vertexIds[i])!,b=map.get(face.vertexIds[(i+1)%face.vertexIds.length])!;
   twice+=a.xMm*b.yMm-b.xMm*a.yMm;
   edges.push({id:face.id+":"+i,faceId:face.id,from:a.id,to:b.id});
  }
  if(Math.abs(twice)<1e-8)throw Error("Degenerate face");
 }
 return {vertexCount:map.size,edgeCount:edges.length,faceCount:s.faces.length,edges};
}
export function moveSketchVertex(s:Sketch2D,vertexId:string,xMm:number,yMm:number):Sketch2D{
 if(!Number.isFinite(xMm)||!Number.isFinite(yMm))throw Error("Invalid coordinates");
 if(!s.vertices.some(v=>v.id===vertexId))throw Error("Vertex not found");
 const result={...s,vertices:s.vertices.map(v=>v.id===vertexId?{...v,xMm,yMm}:v)};
 inspectSketch2D(result);return result;
}
export function translateSketchFace(s:Sketch2D,faceId:string,dxMm:number,dyMm:number):Sketch2D{
 if(!Number.isFinite(dxMm)||!Number.isFinite(dyMm))throw Error("Invalid translation");
 const face=s.faces.find(f=>f.id===faceId);if(!face)throw Error("Face not found");
 const targets=new Set(face.vertexIds);
 const result={...s,vertices:s.vertices.map(v=>targets.has(v.id)?{...v,xMm:v.xMm+dxMm,yMm:v.yMm+dyMm}:v)};
 inspectSketch2D(result);return result;
}
