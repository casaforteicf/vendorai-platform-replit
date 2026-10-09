import type { ParametricWall } from "./RenderStudioParametricWebgl";

type Box = [number, number, number, number, number, number];
export type UnionResult = { vertices: number[][]; faces: number[][]; occupiedCells: number; openingCount: number };

export function unionOrthogonalWalls(walls: ParametricWall[]): UnionResult {
  if (!walls.length || walls.length > 80) throw new Error("União ortogonal suporta 1 a 80 paredes");
  const solids: Box[] = [];
  const voids: Box[][] = [];
  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < .1 || (Math.abs(dx) > 1e-8 && Math.abs(dy) > 1e-8))
      throw new Error("Parede diagonal ou degenerada não suportada");
    if (!Number.isFinite(wall.thickness) || wall.thickness < .05 || wall.thickness > 1 ||
        !Number.isFinite(wall.height) || wall.height <= 0 || wall.height > 20)
      throw new Error("Dimensões inválidas");
    const horizontal = Math.abs(dx) > 1e-8;
    const box: Box = horizontal
      ? [Math.min(wall.start[0], wall.end[0]), Math.max(wall.start[0], wall.end[0]),
        wall.start[1] - wall.thickness / 2, wall.start[1] + wall.thickness / 2, 0, wall.height]
      : [wall.start[0] - wall.thickness / 2, wall.start[0] + wall.thickness / 2,
        Math.min(wall.start[1], wall.end[1]), Math.max(wall.start[1], wall.end[1]), 0, wall.height];
    solids.push(box);
    if (wall.openings.length > 100) throw new Error("Excesso de aberturas");
    voids.push(wall.openings.map(o => {
      if (![o.offset, o.width, o.sill, o.height].every(Number.isFinite) ||
          o.offset < 0 || o.width <= 0 || o.offset + o.width > len ||
          o.sill < 0 || o.height <= 0 || o.sill + o.height > wall.height)
        throw new Error("Vão inválido");
      const axis = horizontal ? 0 : 1;
      const sign = wall.end[axis] >= wall.start[axis] ? 1 : -1;
      const a = wall.start[axis] + sign * o.offset, b = a + sign * o.width;
      return horizontal
        ? [Math.min(a, b), Math.max(a, b), box[2], box[3], o.sill, o.sill + o.height]
        : [box[0], box[1], Math.min(a, b), Math.max(a, b), o.sill, o.sill + o.height];
    }));
  }
  const xs = [...new Set([...solids, ...voids.flat()].flatMap(b => [b[0], b[1]]) )].sort((a,b)=>a-b);
  const ys = [...new Set([...solids, ...voids.flat()].flatMap(b => [b[2], b[3]]) )].sort((a,b)=>a-b);
  const zs = [...new Set([...solids, ...voids.flat()].flatMap(b => [b[4], b[5]]) )].sort((a,b)=>a-b);
  if ((xs.length-1)*(ys.length-1)*(zs.length-1) > 240000) throw new Error("União acima do limite");
  const inside = (b: Box,x:number,y:number,z:number) => b[0]<x&&x<b[1]&&b[2]<y&&y<b[3]&&b[4]<z&&z<b[5];
  const filled = new Set<string>();
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++)for(let k=0;k<zs.length-1;k++){
    const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2,z=(zs[k]+zs[k+1])/2;
    if(solids.some((b,n)=>inside(b,x,y,z)&&!voids[n].some(v=>inside(v,x,y,z))))filled.add(`${i},${j},${k}`);
  }
  const vertices:number[][]=[],faces:number[][]=[],indexes=new Map<string,number>();
  const vertex=(x:number,y:number,z:number)=>{
    const key=[x,y,z].map(v=>v.toFixed(9)).join(",");
    if(!indexes.has(key)){indexes.set(key,vertices.length);vertices.push([x,y,z]);}
    return indexes.get(key)!;
  };
  const face=(corners:number[][])=>faces.push(corners.map(p=>vertex(p[0],p[1],p[2])));
  const has=(i:number,j:number,k:number)=>filled.has(`${i},${j},${k}`);
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++)for(let k=0;k<zs.length-1;k++){
    if(!has(i,j,k))continue;
    const [x0,x1]=[xs[i],xs[i+1]],[y0,y1]=[ys[j],ys[j+1]],[z0,z1]=[zs[k],zs[k+1]];
    if(!has(i-1,j,k))face([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]]);
    if(!has(i+1,j,k))face([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]]);
    if(!has(i,j-1,k))face([[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1]]);
    if(!has(i,j+1,k))face([[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]]);
    if(!has(i,j,k-1))face([[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]]);
    if(!has(i,j,k+1))face([[x0,y1,z1],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1]]);
  }
  return {vertices,faces,occupiedCells:filled.size,openingCount:voids.reduce((n,v)=>n+v.length,0)};
}
