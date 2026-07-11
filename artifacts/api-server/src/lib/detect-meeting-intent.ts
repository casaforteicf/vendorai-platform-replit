/**
 * Detects whether a lead message expresses intent to schedule a meeting
 * or obtain a meeting link.
 *
 * Strategy: normalize the text (lowercase + strip accents) then check for
 * any single keyword from the scheduling vocabulary. One keyword is enough —
 * we intentionally err on the side of inclusion so natural-language variations
 * like "Link de reuniao", "cadê o link?", "quero marcar um horário",
 * "pode agendar pra mim?", "manda o link please" all trigger correctly.
 */

const MEETING_KEYWORDS = [
  "link",
  "reuniao",    // matches "reunião" after accent removal
  "agendar",
  "marcar",
  "horario",    // matches "horário" after accent removal
  "encontro",
  "call",
  "meet",
  "videochamada",
  "videoconferencia",
] as const;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip combining diacritics
}

export function detectMeetingIntent(text: string): boolean {
  const normalized = normalize(text);
  return MEETING_KEYWORDS.some((kw) => normalized.includes(kw));
}
