import type { SalesObjectionOutcome } from "@workspace/db";

export type ObjectionResponseStat = {
  texto: string;
  usos: number;
  conversoes: number;
};

export function normalizeObjectionLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateBreakRate(advances: number, frequency: number): string | null {
  if (frequency <= 0) return null;
  const safeAdvances = Math.max(0, Math.min(advances, frequency));
  return ((safeAdvances / frequency) * 100).toFixed(2);
}

export function mergeResponseStats(
  current: ObjectionResponseStat[],
  responseText: string | null | undefined,
  brokeObjection: boolean,
): ObjectionResponseStat[] {
  const text = responseText?.trim();
  if (!text) return current;

  const normalized = text.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  const next = current.map((item) => ({ ...item }));
  const existing = next.find(
    (item) => item.texto.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim() === normalized,
  );

  if (existing) {
    existing.usos += 1;
    if (brokeObjection) existing.conversoes += 1;
    return next;
  }

  next.push({
    texto: text,
    usos: 1,
    conversoes: brokeObjection ? 1 : 0,
  });

  return next;
}

export function markResponseConversion(
  current: ObjectionResponseStat[],
  responseText: string | null | undefined,
): ObjectionResponseStat[] {
  const text = responseText?.trim();
  if (!text) return current;

  const normalized = text.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  return current.map((item) =>
    item.texto.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim() === normalized
      ? { ...item, conversoes: item.conversoes + 1 }
      : { ...item },
  );
}

export function outcomeBreaksObjection(outcome: SalesObjectionOutcome): boolean {
  return outcome === "advanced" || outcome === "won";
}

export function resolveEventOutcome(input: {
  leadStatus?: string | null;
  inferredOutcome?: string | null;
}): SalesObjectionOutcome {
  const leadStatus = input.leadStatus?.toLocaleLowerCase("pt-BR");
  if (leadStatus === "cliente" || leadStatus === "ganho" || leadStatus === "won") return "won";
  if (leadStatus === "perdido" || leadStatus === "lost") return "lost";
  if (leadStatus === "qualificado") return "advanced";

  switch (input.inferredOutcome) {
    case "advanced":
    case "won":
    case "lost":
    case "no_change":
    case "pending":
      return input.inferredOutcome;
    default:
      return "unknown";
  }
}
