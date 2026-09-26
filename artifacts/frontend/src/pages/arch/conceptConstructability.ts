import type { ConceptRoomShape } from "./conceptGeometry";

export type ConstructabilityIssue = {
  id: string;
  severity: "warning" | "error";
  roomIds: string[];
  message: string;
};

export type ConstructabilityResult = {
  score: number;
  issues: ConstructabilityIssue[];
  strengths: string[];
};

const WET_KINDS = new Set(["banheiro", "cozinha", "lavanderia"]);
const EPS = 0.08;

function overlap(a1:number,a2:number,b1:number,b2:number) {
  return Math.max(0, Math.min(a2,b2) - Math.max(a1,b1));
}

function center(room: ConceptRoomShape) {
  return { x: room.x + room.width/2, y: room.y + room.depth/2 };
}

function distance(a: ConceptRoomShape, b: ConceptRoomShape) {
  const ca=center(a), cb=center(b);
  return Math.hypot(ca.x-cb.x, ca.y-cb.y);
}

function projectedSupportOverlap(upper: ConceptRoomShape, lower: ConceptRoomShape) {
  const ox = overlap(upper.x, upper.x + upper.width, lower.x, lower.x + lower.width);
  const oy = overlap(upper.y, upper.y + upper.depth, lower.y, lower.y + lower.depth);
  return (ox * oy) / Math.max(EPS, upper.width * upper.depth);
}

export function evaluateConstructability(
  rooms: ConceptRoomShape[],
): ConstructabilityResult {
  const issues: ConstructabilityIssue[] = [];
  const strengths: string[] = [];
  let score = 100;

  const floors=[...new Set(rooms.map(r=>r.floor))].sort((a,b)=>a-b);

  for (const floor of floors) {
    const current=rooms.filter(r=>r.floor===floor && r.kind!=="piscina");

    for (const room of current) {
      const span=Math.max(room.width, room.depth);
      if (span > 7.5) {
        score -= 12;
        issues.push({
          id:`constructability-long-span-${room.id}`,
          severity: span > 9 ? "error" : "warning",
          roomIds:[room.id],
          message:`${room.label} possui vão preliminar elevado (${span.toFixed(1)} m); revisar solução estrutural antes de consolidar a planta.`,
        });
      }
    }

    const wet=current.filter(r=>WET_KINDS.has(r.kind));
    for (let i=0;i<wet.length;i++) {
      for (let j=i+1;j<wet.length;j++) {
        if (distance(wet[i],wet[j]) > 8) {
          score -= 4;
          issues.push({
            id:`constructability-wet-dispersed-${wet[i].id}-${wet[j].id}`,
            severity:"warning",
            roomIds:[wet[i].id,wet[j].id],
            message:`${wet[i].label} e ${wet[j].label} estão muito afastados; concentrar áreas molhadas pode reduzir tubulações e custo de execução.`,
          });
        }
      }
    }
  }

  for (const floor of floors.filter(f=>f>0)) {
    const upper=rooms.filter(r=>r.floor===floor && r.kind!=="piscina");
    const lower=rooms.filter(r=>r.floor===floor-1 && r.kind!=="piscina");

    for (const room of upper) {
      const best=lower
        .map(candidate=>({candidate,ratio:projectedSupportOverlap(room,candidate)}))
        .sort((a,b)=>b.ratio-a.ratio)[0];

      if (!best || best.ratio < 0.25) {
        score -= 10;
        issues.push({
          id:`constructability-vertical-support-${room.id}`,
          severity:"warning",
          roomIds:[room.id],
          message:`${room.label} no pavimento superior tem pouco alinhamento com ambientes abaixo; revisar modulação estrutural e transferência de cargas.`,
        });
      }
    }

    const upperWet=upper.filter(r=>WET_KINDS.has(r.kind));
    const lowerWet=lower.filter(r=>WET_KINDS.has(r.kind));
    for (const wet of upperWet) {
      const nearest=lowerWet.map(r=>distance(wet,r)).sort((a,b)=>a-b)[0];
      if (!Number.isFinite(nearest) || nearest > 4) {
        score -= 8;
        issues.push({
          id:`constructability-wet-stack-${wet.id}`,
          severity:"warning",
          roomIds:[wet.id],
          message:`${wet.label} não está próximo de uma área molhada no pavimento inferior; revisar prumadas hidráulicas.`,
        });
      }
    }
  }

  if (!issues.some(i=>i.id.startsWith("constructability-wet-stack-"))) {
    strengths.push("Áreas molhadas apresentam boa lógica preliminar de prumadas entre pavimentos.");
  }
  if (!issues.some(i=>i.id.startsWith("constructability-long-span-"))) {
    strengths.push("Os ambientes evitam vãos preliminares excessivos para o estágio de pré-projeto.");
  }

  return {
    score: Math.max(0,Math.min(100,Math.round(score))),
    issues:[...new Map(issues.map(i=>[i.id,i])).values()],
    strengths,
  };
}
