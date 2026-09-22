export function classifySupportResolution(text: string): "sim" | "parcial" | "nao" | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(nao|negativo|continua|nao resolveu)\b/.test(normalized)) return "nao";
  if (/\b(parcial|parcialmente|mais ou menos|melhorou)\b/.test(normalized)) return "parcial";
  if (/\b(sim|resolvido|resolveu|positivo|ok|certo)\b/.test(normalized)) return "sim";
  return null;
}

export function extractSupportRating(text: string): number | null {
  const withoutCode = text.replace(/\bAST-[A-Z0-9]+-[A-Z0-9]+\b/gi, " ").trim();
  const explicit = withoutCode.match(/\bnota\s*[:=-]?\s*([1-5])\b/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const standalone = withoutCode.match(/(?:^|\D)([1-5])(?:\D|$)/);
  return standalone?.[1] ? Number(standalone[1]) : null;
}

export function declinedSupportRating(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(prefiro nao avaliar|nao quero avaliar|sem avaliacao|nao vou avaliar)\b/.test(normalized);
}
