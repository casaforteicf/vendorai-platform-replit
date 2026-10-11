import type { RenderSceneSnapshot } from "./render-scene-contract";
import type { GeometryTransfer } from "./render-geometry-export";
import type { DiffusePreviewOptions } from "./render-diffuse-preview";

/** Adapts an actual captured scene, never synthesizes meshes or camera parameters. */
export function buildExperimentalRenderOptions(args: {
 snapshot: RenderSceneSnapshot;
 geometry: GeometryTransfer;
 width?: number;
 height?: number;
}): DiffusePreviewOptions {
 const {snapshot,geometry}=args;
 if(snapshot.schemaVersion!==1||geometry.schemaVersion!==1||snapshot.geometryLocked!==true||
   snapshot.warnings.length>0||geometry.truncated||geometry.warnings.length>0)
  throw Error("ARQDOR: captura incompleta ou não confiável");
 const width=args.width??320,height=args.height??240;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262144)
  throw Error("ARQDOR: resolução experimental inválida");
 const meshIds=new Set(snapshot.meshes.map(x=>x.id));
 const capturedById=new Map(snapshot.meshes.map(x=>[x.id,x]));
 const exportedIds=new Set(geometry.meshes.map(x=>x.meshId));
 const materialIds=new Set(snapshot.materials.map(x=>x.id));
 if(meshIds.size!==snapshot.meshes.length || exportedIds.size!==geometry.meshes.length ||
    materialIds.size!==snapshot.materials.length || geometry.meshes.length!==snapshot.meshes.length ||
    geometry.meshes.some(x=>!meshIds.has(x.meshId) || !Number.isSafeInteger(x.triangles) || x.triangles<0 ||
      x.positions.some(v=>!Number.isFinite(v)) || x.normals.some(v=>!Number.isFinite(v)) ||
      x.uvs.some(v=>!Number.isFinite(v)) ||
      (x.materialId!==null && !capturedById.get(x.meshId)?.materialIds.includes(x.materialId)))||
    snapshot.meshes.some(x=>!geometry.meshes.some(y=>y.meshId===x.id && y.triangles===x.triangleCount))||
    geometry.meshes.reduce((n,x)=>n+x.triangles,0)!==geometry.totalTriangles)
  throw Error("ARQDOR: geometria não corresponde à cena capturada");
 const {position,target,fov}=snapshot.camera;
 if([...position,...target,fov].some(x=>!Number.isFinite(x))||!(fov>1&&fov<179)||
    Math.hypot(position[0]-target[0],position[1]-target[1],position[2]-target[2])<1e-6)
  throw Error("ARQDOR: câmera capturada inválida");
 const materials:Record<string,string>={};
 const physical:Record<string,{baseColor:readonly [number,number,number];roughness:number;metalness:number;transmission:number;ior:number}>={};
 for(const material of snapshot.materials){
  if(!/^#[0-9a-f]{6}$/i.test(material.baseColor)||
     !Number.isFinite(material.roughness)||material.roughness<0||material.roughness>1||
     !Number.isFinite(material.metalness)||material.metalness<0||material.metalness>1||
     !Number.isFinite(material.opacity)||material.opacity<0||material.opacity>1)throw Error("ARQDOR: material inválido");
  materials[material.id]=material.baseColor;
  const hex=material.baseColor;
  physical[material.id]={
    // Material color captured as display sRGB: convert to linear for physical transport.
    baseColor:[1,3,5].map(i=>{const srgb=parseInt(hex.slice(i,i+2),16)/255;return srgb<=0.04045?srgb/12.92:Math.pow((srgb+0.055)/1.055,2.4);}) as unknown as readonly [number,number,number],
    roughness:material.roughness,metalness:material.metalness,
    // Alpha is an imperfect approximation of glass: only opt into this in the lab.
    transmission:1-material.opacity,ior:1.5,
  };
 }
 for(const mesh of geometry.meshes){
  if(mesh.materialId && !materials[mesh.materialId])throw Error("ARQDOR: material da malha ausente");
 }
 return {
  geometry,width,height,materials,physicalMaterials:physical,
  camera:{position,target,verticalFovDegrees:fov},
  light:{directionToLight:[0.35,0.8,0.45],color:[1,1,1],intensity:1},
  directionalLight:{directionToLight:[0.35,0.8,0.45],color:[1,1,1],intensity:1},
  maxBounces:2,skyColor:[0.72,0.82,0.95],display:{toneMapping:"aces",exposure:1},
 };
}
