/**
 * ARQDOR LOT-05 — Deterministic *geometry* revision, independent of metadata saves.
 *
 * This non-cryptographic digest is ONLY a change token; it is not a signature,
 * authentication, or access-control mechanism. Always compare with the data
 * read from the tenant-scoped database inside the authenticated backend.
 */
export type ConceptStructuralState = {
  lot: unknown;
  rooms: unknown;
  openingOverrides: unknown;
  facadePreferences: unknown;
  configuration: unknown;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isRecord = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);

// JSONB object order cannot be assumed to match browser serialization.
function sortedJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(sortedJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + sortedJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return text.length.toString(16) + '-' +
    (a >>> 0).toString(16).padStart(8, '0') + '-' +
    (b >>> 0).toString(16).padStart(8, '0');
}

/**
 * Includes architecturally significant persisted fields; excludes render job
 * status, public sharing metadata, title, notes, updatedAt and billing.
 */
export function conceptStructuralRevision(input: ConceptStructuralState): string | null {
  const config = isRecord(input.configuration) ? input.configuration : null;
  if (!config || !Array.isArray(input.rooms) || !isRecord(input.lot)) return null;
  const payload: Json = {
    schema: 1,
    lot: input.lot as Json,
    rooms: input.rooms as Json,
    openingOverrides: (input.openingOverrides ?? {}) as Json,
    facadePreferences: (input.facadePreferences ?? {}) as Json,
    concept: {
      floors: (config.floors ?? null) as Json,
      customWalls: (config.customWalls ?? null) as Json,
      customOpenings: (config.customOpenings ?? null) as Json,
      spaceProfiles: (config.spaceProfiles ?? null) as Json,
      objects: (config.objects ?? null) as Json,
      wallMaterials: (config.wallMaterials ?? null) as Json,
      sitePlacement: (config.sitePlacement ?? null) as Json,
      facadeDesign: (config.facadeDesign ?? null) as Json,
      projectMaster: (config.projectMaster ?? null) as Json,
    },
  };
  return 'geometry:v1:' + fingerprint(sortedJson(payload));
}
