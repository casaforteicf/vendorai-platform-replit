/**
 * Regras de mídia final por formato no Plano de Mídia.
 *
 * Um Reel/Short só pode ser aprovado para publicação quando existe um arquivo
 * de vídeo final vinculado à geração. Aprovar apenas com roteiro/foto fazia o
 * item entrar na fila de publicação e falhar em silêncio no worker.
 */

export const VIDEO_CALENDAR_TYPES = ["reels", "tiktok", "youtube_short", "youtube_video"] as const;

const VIDEO_TYPE_SET = new Set<string>(VIDEO_CALENDAR_TYPES);

export function isVideoCalendarType(tipo: string | null | undefined): boolean {
  return VIDEO_TYPE_SET.has(String(tipo ?? "").trim().toLowerCase());
}

type GenerationLike = {
  variations?: unknown;
  automation?: unknown;
} | null | undefined;

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Extrai o primeiro vídeo final disponível na geração (variações ou automação). */
export function finalVideoUrlFromGeneration(result: GenerationLike): string {
  if (!result || typeof result !== "object") return "";
  const variations = Array.isArray(result.variations) ? result.variations : [];
  for (const variation of variations) {
    if (!variation || typeof variation !== "object" || Array.isArray(variation)) continue;
    const row = variation as Record<string, unknown>;
    if (nonEmptyString(row["videoUrl"])) return String(row["videoUrl"]).trim();
    if (Array.isArray(row["videoUrls"])) {
      const found = row["videoUrls"].find((value) => nonEmptyString(value));
      if (found) return String(found).trim();
    }
  }
  const automation = result.automation && typeof result.automation === "object" && !Array.isArray(result.automation)
    ? result.automation as Record<string, unknown>
    : {};
  if (nonEmptyString(automation["videoUrl"])) return String(automation["videoUrl"]).trim();
  return "";
}

export function generationHasFinalVideo(result: GenerationLike): boolean {
  if (finalVideoUrlFromGeneration(result)) return true;
  const automation = result && typeof result === "object" && result.automation && typeof result.automation === "object"
    ? result.automation as Record<string, unknown>
    : {};
  return nonEmptyString(automation["videoAssetId"]);
}
