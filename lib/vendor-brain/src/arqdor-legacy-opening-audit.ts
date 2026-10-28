/**
 * ARQDOR LOT-06: read-only diagnostic for legacy openings without wallId.
 * Candidate suggestions are never approved geometry or persistence writes.
 * Source positions/dimensions are metres; candidate offsets use millimetres.
 */
export type LegacyReferenceWall = {
  id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number;
};
export type LegacyReferenceOpening = {
  id: string; floor: number; type: 'door' | 'window';
  orientation: 'horizontal' | 'vertical';
  /** Existing marker x/y denote opening centre, not its first edge. */
  x: number; y: number; width?: number; height?: number; sillHeight?: number;
};
export type LegacyAuditCode =
  | 'INVALID_WALL' | 'DUPLICATE_WALL_ID' | 'DUPLICATE_OPENING_ID'
  | 'INVALID_OPENING' | 'DIMENSIONS_MISSING' | 'WALL_NOT_FOUND'
  | 'AMBIGUOUS_WALL' | 'WALL_THICKNESS_UNKNOWN';
export type LegacyAuditIssue = { code: LegacyAuditCode; entityId: string; message: string };
export type LegacyOpeningCandidate = {
  openingId: string; wallId: string; floor: number;
  offsetMm: number; widthMm: number; heightMm: number; sillHeightMm: number;
  requiresReview: true; source: 'legacy_marker_geometry';
};
export type LegacyOpeningAudit = {
  status: 'candidates_found' | 'requires_review';
  candidates: LegacyOpeningCandidate[];
  issues: LegacyAuditIssue[];
  totalOpenings: number;
};
const EPS = 0.000001;
const MATCH_TOLERANCE_M = 0.01;
const BOUNDS_TOLERANCE_M = 0.001;
const validId = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const nonnegative = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const validFloor = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const mm = (metres: number) => Math.round(metres * 1000);

/** No automatic geometric approval, invented dimensions, wall IDs, or mutation. */
export function auditLegacyOpeningAnchors(input: {
  walls: LegacyReferenceWall[];
  openings: LegacyReferenceOpening[];
}): LegacyOpeningAudit {
  const issues: LegacyAuditIssue[] = [];
  const candidates: LegacyOpeningCandidate[] = [];
  const add = (code: LegacyAuditCode, entityId: string, message: string) =>
    issues.push({ code, entityId, message });
  if (!Array.isArray(input.walls) || !Array.isArray(input.openings)) {
    add('INVALID_OPENING', 'project', 'São necessárias listas de paredes e aberturas.');
    return { status: 'requires_review', candidates, issues, totalOpenings: 0 };
  }
  if (!input.walls.length || !input.openings.length) {
    add('INVALID_OPENING', 'project', 'Sem paredes ou aberturas: nenhuma associação pode ser comprovada.');
    return { status: 'requires_review', candidates, issues, totalOpenings: input.openings.length };
  }
  const wallIds = new Set<string>();
  const duplicatedWallIds = new Set<string>();
  const walls: LegacyReferenceWall[] = [];
  for (const wall of input.walls) {
    const id = wall?.id ?? 'unknown-wall';
    if (!validId(id) || !validFloor(wall.floor) ||
      ![wall.x1, wall.y1, wall.x2, wall.y2].every(Number.isFinite)) {
      add('INVALID_WALL', id, 'Identificação, pavimento ou posição da parede inválida.');
      continue;
    }
    const scopedWallId = String(wall.floor) + ":" + id;
    if (wallIds.has(scopedWallId)) {
      duplicatedWallIds.add(scopedWallId);
      add('DUPLICATE_WALL_ID', id, 'Há mais de uma parede com o mesmo ID.');
      continue;
    }
    wallIds.add(scopedWallId);
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    if (Math.hypot(dx, dy) <= EPS || (Math.abs(dx) > EPS && Math.abs(dy) > EPS)) {
      add('INVALID_WALL', id, 'Parede não reta ou de comprimento insuficiente.');
      continue;
    }
    walls.push(wall);
  }
  const openingIds = new Set<string>();
  for (const opening of input.openings) {
    const id = opening?.id ?? 'unknown-opening';
    if (!validId(id) || !validFloor(opening.floor) ||
      !Number.isFinite(opening.x) || !Number.isFinite(opening.y) ||
      !['horizontal', 'vertical'].includes(opening.orientation) ||
      !['door', 'window'].includes(opening.type)) {
      add('INVALID_OPENING', id, 'Tipo, orientação, posição ou identificação inválida.');
      continue;
    }
    if (openingIds.has(id)) {
      add('DUPLICATE_OPENING_ID', id, 'ID de abertura duplicado.');
      continue;
    }
    openingIds.add(id);
    if (!positive(opening.width) || !positive(opening.height) || !nonnegative(opening.sillHeight)) {
      add('DIMENSIONS_MISSING', id, 'Largura, altura e peitoril são obrigatórios.');
      continue;
    }
    const width = opening.width;
    const height = opening.height;
    const sillHeight = opening.sillHeight;
    const matches = walls.filter(wall => {
      if (duplicatedWallIds.has(String(wall.floor) + ":" + wall.id) ||
        wall.floor !== opening.floor) return false;
      const horizontal = Math.abs(wall.y2 - wall.y1) < EPS;
      if ((horizontal ? 'horizontal' : 'vertical') !== opening.orientation) return false;
      const center = horizontal ? opening.x : opening.y;
      const low = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
      const high = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
      const deviation = horizontal ? Math.abs(opening.y - wall.y1) : Math.abs(opening.x - wall.x1);
      return deviation <= MATCH_TOLERANCE_M &&
        center - width / 2 >= low - BOUNDS_TOLERANCE_M &&
        center + width / 2 <= high + BOUNDS_TOLERANCE_M;
    });
    if (matches.length !== 1) {
      add(matches.length ? 'AMBIGUOUS_WALL' : 'WALL_NOT_FOUND', id,
        matches.length ? 'Mais de uma parede candidata: exige escolha técnica.'
          : 'Nenhuma parede comprovada para a posição e largura informadas.');
      continue;
    }
    const wall = matches[0]!;
    const horizontal = opening.orientation === 'horizontal';
    const first = horizontal ? wall.x1 : wall.y1;
    const last = horizontal ? wall.x2 : wall.y2;
    const center = horizontal ? opening.x : opening.y;
    // Offset measured in the HOST WALL direction, including reversed segments.
    const offset = (center - first) * (last >= first ? 1 : -1) - width / 2;
    if (offset < -BOUNDS_TOLERANCE_M) {
      add('WALL_NOT_FOUND', id, 'A abertura ultrapassa a extremidade da parede.');
      continue;
    }
    if (!positive(wall.thickness)) {
      add('WALL_THICKNESS_UNKNOWN', id, 'Espessura não verificada: não pode virar elemento BIM aprovado.');
    }
    candidates.push({
      openingId: id, wallId: wall.id, floor: opening.floor,
      offsetMm: mm(offset), widthMm: mm(width), heightMm: mm(height),
      sillHeightMm: mm(sillHeight),
      requiresReview: true, source: 'legacy_marker_geometry',
    });
  }
  return {
    status: issues.length || candidates.length !== input.openings.length
      ? 'requires_review' : 'candidates_found',
    candidates, issues, totalOpenings: input.openings.length,
  };
}
