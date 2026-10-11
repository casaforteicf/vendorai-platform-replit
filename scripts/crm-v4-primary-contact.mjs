/** Pure CRM participant validation. No database or tenant side effects. */
export function validatePrimaryContact(participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    return { valid: false, reason: 'PARTICIPANTS_REQUIRED' };
  }
  const ids = new Set();
  let primaryCount = 0;
  for (const participant of participants) {
    if (!participant || typeof participant.id !== 'string' || !participant.id.trim()) {
      return { valid: false, reason: 'PARTICIPANT_ID_REQUIRED' };
    }
    if (ids.has(participant.id)) return { valid: false, reason: 'DUPLICATE_PARTICIPANT' };
    ids.add(participant.id);
    if (participant.primary === true) primaryCount++;
  }
  return primaryCount === 1
    ? { valid: true, reason: null }
    : { valid: false, reason: primaryCount ? 'MULTIPLE_PRIMARY_CONTACTS' : 'PRIMARY_CONTACT_REQUIRED' };
}

export function selectPrimaryContact(participants, primaryId) {
  if (!Array.isArray(participants)) throw new TypeError('Participantes inválidos.');
  if (typeof primaryId !== 'string' || !primaryId.trim()) throw new TypeError('Contato principal inválido.');
  if (!participants.some(participant => participant?.id === primaryId)) {
    throw new RangeError('Contato principal não pertence aos participantes.');
  }
  const normalized = participants.map(p => ({ ...p, primary: p.id === primaryId }));
  const result = validatePrimaryContact(normalized);
  if (!result.valid) throw new Error(result.reason);
  return normalized;
}
