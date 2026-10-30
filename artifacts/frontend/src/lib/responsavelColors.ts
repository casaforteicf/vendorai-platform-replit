// Paleta usada quando o administrador ainda não definiu a cor do responsável.
export const RESPONSAVEL_PALETTE = [
  "#2563EB", "#DB2777", "#059669", "#D97706", "#7C3AED",
  "#0891B2", "#DC2626", "#65A30D", "#C026D3", "#0D9488",
] as const;

export const UNASSIGNED_COLOR = "#94A3B8";

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function responsavelColor(userId: string | null | undefined, configured?: Record<string, string>) {
  if (!userId) return UNASSIGNED_COLOR;
  return configured?.[userId] ?? RESPONSAVEL_PALETTE[hashString(userId) % RESPONSAVEL_PALETTE.length];
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}
