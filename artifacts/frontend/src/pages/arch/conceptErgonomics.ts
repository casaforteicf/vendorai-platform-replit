import type { ConceptRoomShape } from "./conceptGeometry";

export type ErgonomicSeverity = "warning" | "error";

export type ErgonomicIssue = {
  id: string;
  severity: ErgonomicSeverity;
  roomId: string;
  message: string;
};

export type ErgonomicRoomResult = {
  roomId: string;
  score: number;
  issues: ErgonomicIssue[];
  requiredWidth: number;
  requiredDepth: number;
};

export type ErgonomicResult = {
  score: number;
  issues: ErgonomicIssue[];
  rooms: ErgonomicRoomResult[];
};

type EnvelopeRule = {
  width: number;
  depth: number;
  label: string;
  severeBelow?: number;
};

/**
 * Envelopes funcionais preliminares.
 * Representam mobiliário essencial + faixa mínima de uso/circulação,
 * não norma legal e não substituem detalhamento executivo.
 */
const RULES: Record<string, EnvelopeRule[]> = {
  quarto: [
    { width: 2.70, depth: 3.00, label: "cama de casal/solteiro + roupeiro + circulação", severeBelow: 2.35 },
  ],
  suite: [
    { width: 3.00, depth: 3.20, label: "cama de casal + criados/roupeiro + circulação", severeBelow: 2.50 },
  ],
  cozinha: [
    { width: 2.20, depth: 3.00, label: "bancada/eletros + circulação de trabalho", severeBelow: 1.80 },
  ],
  banheiro: [
    { width: 1.40, depth: 2.20, label: "lavatório + vaso + banho + circulação", severeBelow: 1.15 },
  ],
  lavanderia: [
    { width: 1.70, depth: 2.20, label: "tanque/máquina + faixa de operação", severeBelow: 1.40 },
  ],
  sala: [
    { width: 3.20, depth: 3.60, label: "sofá/TV + circulação social", severeBelow: 2.80 },
  ],
  gourmet: [
    { width: 3.20, depth: 3.60, label: "bancada/mesa + circulação de uso", severeBelow: 2.80 },
  ],
  garagem: [
    { width: 2.70, depth: 5.20, label: "vaga + abertura de portas + manobra básica", severeBelow: 2.40 },
  ],
  outro: [
    { width: 2.70, depth: 2.70, label: "mobiliário básico + circulação", severeBelow: 2.20 },
  ],
};

function bestOrientation(room: ConceptRoomShape, rule: EnvelopeRule) {
  const normalFit = room.width >= rule.width && room.depth >= rule.depth;
  const rotatedFit = room.width >= rule.depth && room.depth >= rule.width;
  const normalShortfall =
    Math.max(0, rule.width - room.width) + Math.max(0, rule.depth - room.depth);
  const rotatedShortfall =
    Math.max(0, rule.depth - room.width) + Math.max(0, rule.width - room.depth);

  return {
    fits: normalFit || rotatedFit,
    shortfall: Math.min(normalShortfall, rotatedShortfall),
    requiredWidth: normalShortfall <= rotatedShortfall ? rule.width : rule.depth,
    requiredDepth: normalShortfall <= rotatedShortfall ? rule.depth : rule.width,
  };
}

export function evaluateRoomErgonomics(room: ConceptRoomShape): ErgonomicRoomResult {
  const rules = RULES[room.kind] ?? [];
  if (!rules.length || room.kind === "piscina" || room.kind === "circulacao" || room.kind === "escada") {
    return { roomId: room.id, score: 100, issues: [], requiredWidth: 0, requiredDepth: 0 };
  }

  let score = 100;
  const issues: ErgonomicIssue[] = [];
  let requiredWidth = 0;
  let requiredDepth = 0;

  for (const rule of rules) {
    const fit = bestOrientation(room, rule);
    requiredWidth = Math.max(requiredWidth, fit.requiredWidth);
    requiredDepth = Math.max(requiredDepth, fit.requiredDepth);

    if (!fit.fits) {
      const minSide = Math.min(room.width, room.depth);
      const severity: ErgonomicSeverity =
        rule.severeBelow && minSide < rule.severeBelow ? "error" : "warning";
      score -= severity === "error" ? 35 : Math.min(25, Math.round(10 + fit.shortfall * 12));
      issues.push({
        id: `ergonomics-${room.id}-${room.kind}`,
        severity,
        roomId: room.id,
        message: `${room.label} não comporta confortavelmente o envelope funcional de ${rule.label}; disponível ${room.width.toFixed(2)} × ${room.depth.toFixed(2)} m.`,
      });
    }
  }

  const area = room.width * room.depth;
  if ((room.kind === "quarto" || room.kind === "suite") && area < 8) {
    score -= 20;
    issues.push({
      id: `ergonomics-area-${room.id}`,
      severity: "warning",
      roomId: room.id,
      message: `${room.label} possui área útil muito reduzida para mobiliário e circulação (${area.toFixed(1)} m²).`,
    });
  }

  return {
    roomId: room.id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues,
    requiredWidth,
    requiredDepth,
  };
}

export function evaluateConceptErgonomics(rooms: ConceptRoomShape[]): ErgonomicResult {
  const roomResults = rooms.map(evaluateRoomErgonomics);
  const issues = roomResults.flatMap((result) => result.issues);
  const considered = roomResults.filter((result) => result.requiredWidth > 0 || result.requiredDepth > 0);
  const score = considered.length
    ? Math.round(considered.reduce((sum, result) => sum + result.score, 0) / considered.length)
    : 100;

  return {
    score,
    issues,
    rooms: roomResults,
  };
}
