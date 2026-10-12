/** CRM V4-01: append-only relationship events with conservative legacy handling. */
export function appendRelationshipEvent(
  metadata: Record<string, unknown> | null | undefined,
  action: "linked" | "updated" | "unlinked",
  actorId?: string | null,
) {
  const previous = metadata ?? {};
  const history = Array.isArray(previous.relationshipHistory) ? previous.relationshipHistory : [];
  // Never fabricate when a relationship was originally created.
  const legacyBaseline = history.length === 0 && previous.legacyRelationship === true
    ? [{ action: "legacy_existing", at: null, actorId: null }]
    : [];
  return {
    ...previous,
    inactive: action === "unlinked",
    relationshipHistory: [
      ...legacyBaseline,
      ...history,
      { action, at: new Date().toISOString(), actorId: actorId ?? null },
    ],
  };
}
