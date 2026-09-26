import type { ConceptRoomShape } from "./conceptGeometry";

export type BuildabilityIssue = {
  id: string;
  severity: "warning" | "error";
  roomIds: string[];
  message: string;
};

export type BuildabilityMetrics = {
  builtArea: number;
  wallPerimeter: number;
  perimeterAreaRatio: number;
  wetClusterSpread: number;
  upperFloorMisalignment: number;
  shapeComplexity: number;
};

export type BuildabilityResult = {
  score: number;
  costIndex: number;
  metrics: BuildabilityMetrics;
  issues: BuildabilityIssue[];
  strengths: string[];
};

const WET = new Set(["banheiro","cozinha","lavanderia"]);
const EPS=0.08;

function overlap(a1:number,a2:number,b1:number,b2:number) {
  return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));
}

function center(room:ConceptRoomShape) {
  return {x:room.x+room.width/2,y:room.y+room.depth/2};
}

function distance(a:ConceptRoomShape,b:ConceptRoomShape) {
  const ca=center(a),cb=center(b);
  return Math.hypot(ca.x-cb.x,ca.y-cb.y);
}

function exposedPerimeter(room:ConceptRoomShape, floorRooms:ConceptRoomShape[]) {
  let perimeter=2*(room.width+room.depth);
  for (const other of floorRooms) {
    if (other.id===room.id) continue;
    const vertical =
      (Math.abs(room.x+room.width-other.x)<=EPS || Math.abs(other.x+other.width-room.x)<=EPS)
      ? overlap(room.y,room.y+room.depth,other.y,other.y+other.depth) : 0;
    const horizontal =
      (Math.abs(room.y+room.depth-other.y)<=EPS || Math.abs(other.y+other.depth-room.y)<=EPS)
      ? overlap(room.x,room.x+room.width,other.x,other.x+other.width) : 0;
    perimeter -= vertical + horizontal;
  }
  return Math.max(0,perimeter);
}

function supportRatio(upper:ConceptRoomShape,lower:ConceptRoomShape) {
  const ox=overlap(upper.x,upper.x+upper.width,lower.x,lower.x+lower.width);
  const oy=overlap(upper.y,upper.y+upper.depth,lower.y,lower.y+lower.depth);
  return (ox*oy)/Math.max(EPS,upper.width*upper.depth);
}

export function evaluateBuildabilityCost(
  rooms:ConceptRoomShape[],
): BuildabilityResult {
  const indoor=rooms.filter(r=>r.kind!=="piscina");
  const floors=[...new Set(indoor.map(r=>r.floor))].sort((a,b)=>a-b);
  const builtArea=indoor.reduce((s,r)=>s+r.width*r.depth,0);

  let wallPerimeter=0;
  let shapeComplexity=0;
  let wetClusterSpread=0;
  let upperFloorMisalignment=0;

  const issues:BuildabilityIssue[]=[];
  const strengths:string[]=[];

  for (const floor of floors) {
    const current=indoor.filter(r=>r.floor===floor);
    const exposed=current.reduce((s,r)=>s+exposedPerimeter(r,current),0);
    wallPerimeter += exposed;

    const bbox=current.length ? {
      minX:Math.min(...current.map(r=>r.x)),
      minY:Math.min(...current.map(r=>r.y)),
      maxX:Math.max(...current.map(r=>r.x+r.width)),
      maxY:Math.max(...current.map(r=>r.y+r.depth)),
    } : null;
    if (bbox) {
      const bboxArea=Math.max(EPS,(bbox.maxX-bbox.minX)*(bbox.maxY-bbox.minY));
      const floorArea=current.reduce((s,r)=>s+r.width*r.depth,0);
      shapeComplexity += Math.max(0,1-floorArea/bboxArea);
    }

    const wet=current.filter(r=>WET.has(r.kind));
    if (wet.length>1) {
      let total=0,pairs=0;
      for (let i=0;i<wet.length;i++) for (let j=i+1;j<wet.length;j++) {
        total+=distance(wet[i],wet[j]); pairs++;
      }
      wetClusterSpread += pairs ? total/pairs : 0;
    }
  }

  for (const floor of floors.filter(f=>f>0)) {
    const upper=indoor.filter(r=>r.floor===floor);
    const lower=indoor.filter(r=>r.floor===floor-1);
    for (const room of upper) {
      const best=Math.max(0,...lower.map(candidate=>supportRatio(room,candidate)));
      upperFloorMisalignment += 1-best;
    }
  }

  const perimeterAreaRatio=builtArea>0 ? wallPerimeter/builtArea : 0;

  let score=100;
  if (perimeterAreaRatio>0.65) {
    score-=Math.min(18,Math.round((perimeterAreaRatio-0.65)*30));
    issues.push({
      id:"buildability-high-perimeter",
      severity:"warning",
      roomIds:[],
      message:"A solução possui perímetro de paredes elevado em relação à área construída; uma forma mais compacta tende a reduzir custo e tempo de execução.",
    });
  }

  if (shapeComplexity>0.22) {
    score-=Math.min(16,Math.round(shapeComplexity*35));
    issues.push({
      id:"buildability-shape-complexity",
      severity:"warning",
      roomIds:[],
      message:"A planta apresenta muitos recortes/vazios na forma geral; simplificar a volumetria pode melhorar eficiência construtiva.",
    });
  }

  if (wetClusterSpread>7) {
    score-=Math.min(12,Math.round((wetClusterSpread-7)*2));
    issues.push({
      id:"buildability-wet-spread",
      severity:"warning",
      roomIds:indoor.filter(r=>WET.has(r.kind)).map(r=>r.id),
      message:"As áreas molhadas estão dispersas, aumentando potencialmente tubulações, shafts e pontos de manutenção.",
    });
  }

  if (upperFloorMisalignment>0.35) {
    score-=Math.min(18,Math.round(upperFloorMisalignment*6));
    issues.push({
      id:"buildability-upper-misalignment",
      severity:"warning",
      roomIds:indoor.filter(r=>r.floor>0).map(r=>r.id),
      message:"Há desalinhamento relevante entre pavimentos, o que pode aumentar vigas de transição e complexidade estrutural.",
    });
  }

  const costIndex = Math.round((
    100
    + Math.max(0,perimeterAreaRatio-0.55)*45
    + shapeComplexity*30
    + Math.max(0,wetClusterSpread-4)*1.8
    + upperFloorMisalignment*4
  )*10)/10;

  if (perimeterAreaRatio<=0.65) strengths.push("Boa compacidade preliminar entre área construída e perímetro de paredes.");
  if (shapeComplexity<=0.22) strengths.push("Forma geral relativamente simples, favorecendo execução e controle de custo.");
  if (wetClusterSpread<=7) strengths.push("Áreas molhadas apresentam concentração razoável para o pré-projeto.");

  return {
    score:Math.max(0,Math.min(100,Math.round(score))),
    costIndex,
    metrics:{
      builtArea:Math.round(builtArea*10)/10,
      wallPerimeter:Math.round(wallPerimeter*10)/10,
      perimeterAreaRatio:Math.round(perimeterAreaRatio*1000)/1000,
      wetClusterSpread:Math.round(wetClusterSpread*10)/10,
      upperFloorMisalignment:Math.round(upperFloorMisalignment*100)/100,
      shapeComplexity:Math.round(shapeComplexity*1000)/1000,
    },
    issues,
    strengths,
  };
}
