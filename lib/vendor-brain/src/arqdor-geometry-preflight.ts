/** ARQDOR — canonical geometry preflight (LOT-01).
 * Pure calculations only. Does not mutate projects, approve engineering,
 * or replace mandatory server-side tenant/permission checks.
 * Canonical units: millimetres. Legacy metre-based inputs require an explicit adapter.
 */
export type GeometryWall = {
  id: string; floorId: string;
  x1Mm: number; y1Mm: number; x2Mm: number; y2Mm: number;
  thicknessMm: number; heightMm?: number;
};

export type GeometryOpening = {
  id: string; wallId: string; floorId: string;
  type: 'door' | 'window'; offsetMm: number; widthMm: number;
  heightMm: number; sillHeightMm: number;
};

export type CanonicalGeometrySnapshot = {
  tenantId: string; projectId: string; revisionId: string;
  unit: 'mm'; walls: GeometryWall[]; openings: GeometryOpening[];
};

export type GeometryIssueCode =
  | 'INVALID_SCOPE' | 'INVALID_UNIT' | 'INVALID_ID' | 'DUPLICATE_WALL'
  | 'DUPLICATE_OPENING' | 'INVALID_DIMENSION' | 'INVALID_WALL'
  | 'WALL_NOT_FOUND' | 'FLOOR_MISMATCH' | 'OPENING_OUTSIDE_WALL'
  | 'OPENING_ABOVE_WALL' | 'OPENING_OVERLAP' | 'TENANT_MISMATCH'
  | 'PROJECT_MISMATCH' | 'REVISION_MISMATCH';
export type GeometryIssue = { code: GeometryIssueCode; entityId: string; message: string };
export type GeometryValidation = { valid: boolean; issues: GeometryIssue[] };

const validId = (id: unknown) => typeof id === 'string' && id.trim().length > 0;
const positive = (n: number) => Number.isFinite(n) && n > 0;
const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
const TOLERANCE_MM = 1;

export function validateCanonicalGeometry(snapshot: CanonicalGeometrySnapshot): GeometryValidation {
  const issues: GeometryIssue[] = [];
  const add = (code: GeometryIssueCode, entityId: string, message: string) => {
    issues.push({ code, entityId, message });
  };
  if (![snapshot.tenantId, snapshot.projectId, snapshot.revisionId].every(validId)) {
    add('INVALID_SCOPE', 'project', 'Tenant, projeto e revisão são obrigatórios.');
  }
  if (snapshot.unit !== 'mm') add('INVALID_UNIT', 'project', 'Unidade canônica deve ser mm.');
  if (!Array.isArray(snapshot.walls) || !Array.isArray(snapshot.openings)) {
    add('INVALID_DIMENSION', 'project', 'Paredes e aberturas devem ser listas.');
    return { valid: false, issues };
  }

  if (snapshot.walls.length === 0) add('INVALID_WALL', 'project', 'Planta sem paredes verificáveis.');
  const walls = new Map<string, { wall: GeometryWall; lengthMm: number; usable: boolean }>();
  for (const wall of snapshot.walls) {
    if (!validId(wall.id) || !validId(wall.floorId)) {
      add('INVALID_ID', wall.id || 'wall', 'Parede e pavimento precisam de IDs estáveis.');
      continue;
    }
    if (walls.has(wall.id)) {
      add('DUPLICATE_WALL', wall.id, 'ID de parede duplicado.');
      continue;
    }
    const finite = [wall.x1Mm, wall.y1Mm, wall.x2Mm, wall.y2Mm].every(Number.isFinite);
    const lengthMm = finite ? Math.hypot(wall.x2Mm - wall.x1Mm, wall.y2Mm - wall.y1Mm) : NaN;
    const usable = finite && positive(lengthMm) && positive(wall.thicknessMm)
      && (wall.heightMm === undefined || positive(wall.heightMm));
    if (!usable) add('INVALID_WALL', wall.id, 'Parede com geometria ou medidas inválidas.');
    walls.set(wall.id, { wall, lengthMm, usable });
  }

  const openings = new Set<string>();
  const byWall = new Map<string, GeometryOpening[]>();
  for (const opening of snapshot.openings) {
    if (!validId(opening.id) || !validId(opening.floorId) || !validId(opening.wallId)) {
      add('INVALID_ID', opening.id || 'opening', 'Abertura exige IDs de abertura, parede e pavimento.');
      continue;
    }
    if (openings.has(opening.id)) {
      add('DUPLICATE_OPENING', opening.id, 'ID de abertura duplicado.');
      continue;
    }
    openings.add(opening.id);
    const host = walls.get(opening.wallId);
    if (!host) {
      add('WALL_NOT_FOUND', opening.id, 'Abertura sem parede hospedeira.');
      continue;
    }
    if (host.wall.floorId !== opening.floorId) {
      add('FLOOR_MISMATCH', opening.id, 'Abertura e parede pertencem a pavimentos diferentes.');
    }
    if (![opening.offsetMm, opening.widthMm, opening.heightMm, opening.sillHeightMm].every(Number.isFinite)
      || !nonnegative(opening.offsetMm) || !positive(opening.widthMm)
      || !positive(opening.heightMm) || !nonnegative(opening.sillHeightMm)) {
      add('INVALID_DIMENSION', opening.id, 'Dimensões ou peitoril inválidos.');
      continue;
    }
    if (host.usable && opening.offsetMm + opening.widthMm > host.lengthMm + TOLERANCE_MM) {
      add('OPENING_OUTSIDE_WALL', opening.id, 'Abertura ultrapassa o comprimento da parede.');
    }
    if (host.wall.heightMm !== undefined &&
      opening.sillHeightMm + opening.heightMm > host.wall.heightMm + TOLERANCE_MM) {
      add('OPENING_ABOVE_WALL', opening.id, 'Abertura ultrapassa a altura da parede.');
    }
    if (!byWall.has(opening.wallId)) byWall.set(opening.wallId, []);
    byWall.get(opening.wallId)!.push(opening);
  }

  for (const hostOpenings of byWall.values()) {
    const sorted = [...hostOpenings].sort((a, b) => a.offsetMm - b.offsetMm);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (current.offsetMm + TOLERANCE_MM < previous.offsetMm + previous.widthMm) {
        add('OPENING_OVERLAP', current.id, 'Sobreposição com ' + previous.id + '.');
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

/** Checks provenance only. A render also needs independent visual/3D fidelity QA. */
export function validateDerivedArtifactSource(
  snapshot: CanonicalGeometrySnapshot,
  artifact: { tenantId: string; projectId: string; revisionId: string },
): GeometryValidation {
  const issues: GeometryIssue[] = [];
  if (!validId(artifact.tenantId) || artifact.tenantId !== snapshot.tenantId) {
    issues.push({ code: 'TENANT_MISMATCH', entityId: 'artifact', message: 'Tenant incompatível.' });
  }
  if (!validId(artifact.projectId) || artifact.projectId !== snapshot.projectId) {
    issues.push({ code: 'PROJECT_MISMATCH', entityId: 'artifact', message: 'Projeto incompatível.' });
  }
  if (!validId(artifact.revisionId) || artifact.revisionId !== snapshot.revisionId) {
    issues.push({ code: 'REVISION_MISMATCH', entityId: 'artifact', message: 'Revisão desatualizada ou ausente.' });
  }
  return { valid: issues.length === 0, issues };
}
