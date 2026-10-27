import {
  validateCanonicalGeometry,
  type CanonicalGeometrySnapshot,
  type GeometryIssue,
} from './arqdor-geometry-preflight';

/**
 * ARQDOR LOT-02 — read-only adapter from arch_concept_projects.configuration.
 *
 * The existing schema stores dimensions in metres. This adapter performs an
 * explicit metre-to-millimetre conversion and NEVER manufactures missing host
 * walls, dimensions, or project revisions. Room-derived walls require a
 * separate, verified wall-identity adapter.
 *
 * No AI inference, persistence, or approval is performed.
 */
export type ConceptGeometrySource = 'project_master' | 'draft';
export type ConceptGeometryAdaptation = {
  source: ConceptGeometrySource;
  status: 'valid' | 'requires_review';
  snapshot: CanonicalGeometrySnapshot | null;
  issues: GeometryIssue[];
  reasons: string[];
};

export type PersistedConceptGeometryInput = {
  tenantId: string;
  projectId: string;
  configuration: unknown;
};

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const metersToMillimetres = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 1_000_000) / 1_000
    : Number.NaN;

const safeId = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : '';

const floorId = (value: unknown): string =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? 'floor:' + value
    : '';

const unsupported = (
  source: ConceptGeometrySource,
  reason: string,
): ConceptGeometryAdaptation =>
  ({ source, status: 'requires_review', snapshot: null, reasons: [reason], issues: [] });

/**
 * Exports a canonical snapshot only for source records with explicit wall IDs,
 * wall-hosted openings and a meaningful revision. Never fall back to room
 * rectangles without a deterministic ID mapping for opening hosts.
 */
export function adaptPersistedConceptGeometry(
  input: PersistedConceptGeometryInput,
): ConceptGeometryAdaptation {
  const configuration = isObject(input.configuration) ? input.configuration : null;
  if (!configuration) return unsupported('draft', 'configuration_missing');

  const hasMaster = configuration.projectMaster !== undefined && configuration.projectMaster !== null;
  const source: ConceptGeometrySource = hasMaster ? 'project_master' : 'draft';
  const selected = hasMaster ? configuration.projectMaster : configuration;
  if (!isObject(selected)) return unsupported(source, 'geometry_source_invalid');

  const reasons: string[] = [];
  let revisionId = '';
  if (source === 'project_master') {
    if (selected.geometryVersion !== 'master_facade_v1')
      reasons.push('unsupported_master_geometry_version');
    if (typeof selected.version !== 'number' || !Number.isSafeInteger(selected.version) || selected.version < 1)
      reasons.push('master_revision_missing');
    else revisionId = 'master:v' + selected.version;
    if (!safeId(selected.sourceConceptId) || selected.sourceConceptId !== input.projectId)
      reasons.push('master_source_mismatch');
    const proof = isObject(selected.acceptanceProof) ? selected.acceptanceProof : null;
    if (!proof || proof.status !== 'approved') reasons.push('master_not_approved');
  } else if (
    typeof configuration.revisionNumber === 'number' &&
    Number.isSafeInteger(configuration.revisionNumber) &&
    configuration.revisionNumber >= 1
  ) {
    revisionId = 'draft:r' + configuration.revisionNumber;
  } else {
    reasons.push('draft_revision_missing');
  }

  const rawWalls = selected.customWalls;
  const rawOpenings = selected.customOpenings;
  if (!Array.isArray(rawWalls) || !Array.isArray(rawOpenings))
    return { source, status: 'requires_review', snapshot: null, reasons: [...reasons, 'explicit_wall_or_opening_arrays_missing'], issues: [] };
  if (rawWalls.length === 0) reasons.push('no_explicit_walls_room_derived_geometry_not_verified');
  const walls = rawWalls.map((raw: unknown) => {
    const wall = isObject(raw) ? raw : {};
    return {
      id: safeId(wall.id), floorId: floorId(wall.floor),
      x1Mm: metersToMillimetres(wall.x1), y1Mm: metersToMillimetres(wall.y1),
      x2Mm: metersToMillimetres(wall.x2), y2Mm: metersToMillimetres(wall.y2),
      thicknessMm: metersToMillimetres(wall.thickness),
      // Missing wall height remains unknown rather than silently assuming 2.8m.
      ...(wall.height === undefined ? {} : { heightMm: metersToMillimetres(wall.height) }),
    };
  });
  const openings = rawOpenings.map((raw: unknown) => {
    const opening = isObject(raw) ? raw : {};
    return {
      id: safeId(opening.id),
      wallId: safeId(opening.wallId),
      floorId: floorId(opening.floor),
      type: opening.type === 'door' ? 'door' as const : 'window' as const,
      offsetMm: metersToMillimetres(opening.offset),
      widthMm: metersToMillimetres(opening.width),
      heightMm: metersToMillimetres(opening.height),
      sillHeightMm: metersToMillimetres(opening.sillHeight),
    };
  });
  // Wrong opening types never become accepted windows.
  if (rawOpenings.some((raw: unknown) => !isObject(raw) || (raw.type !== 'window' && raw.type !== 'door')))
    reasons.push('unknown_opening_type');

  const snapshot: CanonicalGeometrySnapshot = {
    tenantId: input.tenantId, projectId: input.projectId,
    revisionId: revisionId || 'unversioned-invalid', unit: 'mm',
    walls, openings,
  };
  const validation = validateCanonicalGeometry(snapshot);
  if (reasons.length || validation.issues.length)
    return { source, status: 'requires_review', snapshot, reasons, issues: validation.issues };
  return { source, status: 'valid', snapshot, reasons: [], issues: [] };
}
