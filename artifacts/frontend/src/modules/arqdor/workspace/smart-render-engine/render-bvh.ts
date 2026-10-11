import type { GeometryTransfer } from "./render-geometry-export";

export type Vec3 = readonly [number, number, number];
export type Ray = Readonly<{ origin: Vec3; direction: Vec3 }>;
export type RayHit = Readonly<{ meshId: string; materialId: string | null; triangle: number; distance: number; point: Vec3; barycentric: Vec3 }>;
type Triangle = { a: Vec3; b: Vec3; c: Vec3; meshId: string; materialId: string | null; triangle: number; min: Vec3; max: Vec3; center: Vec3 };
type Node = { min: Vec3; max: Vec3; left?: Node; right?: Node; triangles?: Triangle[] };
const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot = (a: Vec3,b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const bounds = (items: Triangle[]) => {
  const lo=[Infinity,Infinity,Infinity], hi=[-Infinity,-Infinity,-Infinity];
  for(const t of items)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],t.min[i]);hi[i]=Math.max(hi[i],t.max[i]);}
  return {min:lo as unknown as Vec3,max:hi as unknown as Vec3};
};
function build(items: Triangle[],depth=0): Node {
  const box=bounds(items);
  if(items.length<=8 || depth>=32) return {...box,triangles:items};
  const extent=box.max.map((v,i)=>v-box.min[i]);
  const axis=extent.indexOf(Math.max(...extent));
  items.sort((a,b)=>a.center[axis]-b.center[axis]);
  const middle=Math.floor(items.length/2);
  return {...box,left:build(items.slice(0,middle),depth+1),right:build(items.slice(middle),depth+1)};
}
function boxHit(ray:Ray,min:Vec3,max:Vec3,best:number): boolean {
  let near=0,far=best;
  for(let i=0;i<3;i++){
    const d=ray.direction[i],o=ray.origin[i];
    if(Math.abs(d)<1e-12){if(o<min[i]||o>max[i])return false;continue;}
    const a=(min[i]-o)/d,b=(max[i]-o)/d;
    near=Math.max(near,Math.min(a,b));
    far=Math.min(far,Math.max(a,b));
    if(far<near)return false;
  }
  return true;
}
function triHit(ray:Ray,t:Triangle): RayHit|null {
  const e1=sub(t.b,t.a),e2=sub(t.c,t.a),p=cross(ray.direction,e2);
  const determinant=dot(e1,p);
  if(Math.abs(determinant)<1e-10)return null;
  const inv=1/determinant,s=sub(ray.origin,t.a);
  const u=dot(s,p)*inv;if(u<0||u>1)return null;
  const q=cross(s,e1),v=dot(ray.direction,q)*inv;if(v<0||u+v>1)return null;
  const distance=dot(e2,q)*inv;if(distance<=1e-7)return null;
  return {meshId:t.meshId,materialId:t.materialId,triangle:t.triangle,distance,
    point:[ray.origin[0]+distance*ray.direction[0],ray.origin[1]+distance*ray.direction[1],ray.origin[2]+distance*ray.direction[2]],
    barycentric:[1-u-v,u,v]};
}
/** CPU BVH prototype: geometry must be complete; does not shade or produce pixels. */
export function createRenderBvh(transfer:GeometryTransfer) {
  if(transfer.truncated || transfer.warnings.length) throw new Error("ARQDOR: geometria incompleta ou não suportada para BVH");
  const triangles:Triangle[]=[];
  for(const mesh of transfer.meshes) {
    if(mesh.positions.length!==mesh.triangles*9)throw new Error("ARQDOR: buffer de posições inválido");
    for(let i=0;i<mesh.triangles;i++){
      const offset=i*9,p=mesh.positions;
      const a:Vec3=[p[offset],p[offset+1],p[offset+2]],b:Vec3=[p[offset+3],p[offset+4],p[offset+5]],c:Vec3=[p[offset+6],p[offset+7],p[offset+8]];
      if([...a,...b,...c].some(n=>!Number.isFinite(n)))throw new Error("ARQDOR: coordenadas inválidas");
      const min:Vec3=[0,1,2].map(k=>Math.min(a[k],b[k],c[k])) as unknown as Vec3;
      const max:Vec3=[0,1,2].map(k=>Math.max(a[k],b[k],c[k])) as unknown as Vec3;
      triangles.push({a,b,c,min,max,center:[0,1,2].map(k=>(a[k]+b[k]+c[k])/3) as unknown as Vec3,meshId:mesh.meshId,materialId:mesh.materialId,triangle:i});
    }
  }
  const root=triangles.length?build(triangles):null;
  return {triangleCount:triangles.length,intersect(ray:Ray):RayHit|null {
    if([...ray.origin,...ray.direction].some(n=>!Number.isFinite(n))||dot(ray.direction,ray.direction)<1e-20)
      throw new Error("ARQDOR: raio inválido");
    if(!root)return null;
    let closest:RayHit|null=null;
    const stack=[root];
    while(stack.length){
      const node=stack.pop()!;
      if(!boxHit(ray,node.min,node.max,closest?.distance??Infinity))continue;
      if(node.triangles)for(const t of node.triangles){const hit=triHit(ray,t);if(hit&&(!closest||hit.distance<closest.distance))closest=hit;}
      else {if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}
    }
    return closest;
  }};
}
