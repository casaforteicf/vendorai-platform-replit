/**
 * A render must name the exact persisted geometric revision that it depicts.
 * Never derive provenance from unsaved local editor state or from wall coordinates.
 */
export function conceptRenderRevision(
  input: {
    updatedAt?: string | null;
    configuration?: { revisionNumber?: number | null } | null;
  },
): string | null {
  const revision = input.configuration?.revisionNumber;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return null;
  const updated = input.updatedAt;
  if (!updated || typeof updated !== 'string') return null;
  const timestamp = new Date(updated);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return 'draft:r' + revision + ':updated:' + timestamp.toISOString();
}
