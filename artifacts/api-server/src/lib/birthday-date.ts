export type BirthdayParts = { month: number; day: number };
function valid(month: number, day: number): BirthdayParts | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { month, day } : null;
}
export function parseBirthdayParts(value: unknown): BirthdayParts | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/);
  if (match) return valid(Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2}|\d{4}))?$/);
  return match ? valid(Number(match[2]), Number(match[1])) : null;
}
export function isBirthdayOn(value: unknown, month: number, day: number): boolean {
  const birthday = parseBirthdayParts(value);
  return birthday?.month === month && birthday.day === day;
}
