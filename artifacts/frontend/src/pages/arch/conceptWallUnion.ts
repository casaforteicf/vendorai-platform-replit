import type { WallBox } from "./conceptWallSolids";
import type { IndexedWallMesh } from "./conceptWallBoxMesh";

export type WallUnionMesh = IndexedWallMesh & { sourceWallIds: string[]; triangleWallIds: string[][] };
export type WallUnionResult = { meshes: WallUnionMesh[]; warnings: string[] };
const EPS = 1e-6;
const unique = (values: number[]) => [...new Set(values.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

/**
 * Coordinate-compressed union boundary for orthogonal solid boxes.
 * Internal faces are removed, even at T-junctions and crossings. No source
 * geometry is mutated. Not a general CSG engine for diagonal/curved walls.
 */
export function buildOrthogonalWallUnion(boxes: WallBox[], maxCells = 250000): WallUnionResult {
  const warnings: string[] = [];
  const meshes: WallUnionMesh[] = [];
  const floors = [...new Set(boxes.map(b => b.floor))].sort((a,b) => a-b);
  for (const floor of floors) {
    const source = boxes.filter(b => b.floor === floor);
    const valid = source.filter(b => {
      const ok = [b.x,b.y,b.z,b.width,b.depth,b.height].every(Number.isFinite) &&
        b.width > EPS && b.depth > EPS && b.height > EPS;
      if (!ok) warnings.push(`WALL_UNION_INVALID:${b.wallId}`);
      return ok;
    });
    if (!valid.length) continue;
    const xs = unique(valid.flatMap(b => [b.x,b.x+b.width]));
    const ys = unique(valid.flatMap(b => [b.y,b.y+b.depth]));
    const zs = unique(valid.flatMap(b => [b.z,b.z+b.height]));
    const nx = xs.length-1, ny = ys.length-1, nz = zs.length-1;
    if (nx*ny*nz > maxCells) {
      warnings.push(`WALL_UNION_LIMIT:${floor}`);
      continue;
    }
    const filled = new Set<number>();
    const ids = new Set<string>();
    const owners = new Map<number, Set<string>>();
    const key = (i:number,j:number,k:number) => (i*ny+j)*nz+k;
    const index = (array:number[], value:number) => array.findIndex(v => Math.abs(v-value)<EPS);
    for(const b of valid) {
      const x0=index(xs,b.x),x1=index(xs,b.x+b.width);
      const y0=index(ys,b.y),y1=index(ys,b.y+b.depth);
      const z0=index(zs,b.z),z1=index(zs,b.z+b.height);
      if ([x0,x1,y0,y1,z0,z1].some(n=>n<0)) {
        warnings.push(`WALL_UNION_PRECISION:${b.wallId}`);
        continue;
      }
      ids.add(b.wallId);
      for(let i=x0;i<x1;i++) for(let j=y0;j<y1;j++) for(let k=z0;k<z1;k++) {
        const cell=key(i,j,k);
        filled.add(cell);
        const contributors=owners.get(cell) ?? new Set<string>();
        contributors.add(b.wallId);
        owners.set(cell,contributors);
      }
    }
    if(!filled.size) continue;
    const positions:number[] = [],indices:number[] = [];
    const triangleWallIds: string[][] = [];
    const vertexMap=new Map<string,number>();
    const vertex=(x:number,y:number,z:number)=>{
      const token=`${x},${y},${z}`;
      let n=vertexMap.get(token);
      if(n===undefined){n=positions.length/3;vertexMap.set(token,n);positions.push(x,y,z);}
      return n;
    };
    const quad=(a:number[],b:number[],c:number[],d:number[],sourceWallIds:string[])=>{
      const v=[a,b,c,d].map(p=>vertex(p[0],p[1],p[2]));
      indices.push(v[0],v[1],v[2],v[0],v[2],v[3]);
      triangleWallIds.push([...sourceWallIds], [...sourceWallIds]);
    };
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
      if(!filled.has(key(i,j,k)))continue;
      const a=xs[i],b=xs[i+1],c=ys[j],d=ys[j+1],e=zs[k],f=zs[k+1];
      const contributors=[...(owners.get(key(i,j,k)) ?? [])].sort();
      const exposed=(di:number,dj:number,dk:number)=>i+di<0||i+di>=nx||j+dj<0||j+dj>=ny||k+dk<0||k+dk>=nz||!filled.has(key(i+di,j+dj,k+dk));
      if(exposed(-1,0,0))quad([a,c,e],[a,c,f],[a,d,f],[a,d,e],contributors);
      if(exposed(1,0,0))quad([b,c,e],[b,d,e],[b,d,f],[b,c,f],contributors);
      if(exposed(0,-1,0))quad([a,c,e],[b,c,e],[b,c,f],[a,c,f],contributors);
      if(exposed(0,1,0))quad([a,d,e],[a,d,f],[b,d,f],[b,d,e],contributors);
      if(exposed(0,0,-1))quad([a,c,e],[a,d,e],[b,d,e],[b,c,e],contributors);
      if(exposed(0,0,1))quad([a,c,f],[b,c,f],[b,d,f],[a,d,f],contributors);
    }
    meshes.push({wallId:`union-floor-${floor}`,floor,positions,indices,sourceWallIds:[...ids].sort(),triangleWallIds});
  }
  return {meshes,warnings};
}
