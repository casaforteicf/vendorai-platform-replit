import { existsSync } from "fs";
import { createRequire } from "module";
import { delimiter, dirname } from "path";

const requireFromHere = createRequire(import.meta.url);

let configured = false;

/**
 * Garante um binário de ffmpeg disponível no PATH do processo.
 *
 * Em produção o container pode ou não ter ffmpeg instalado. Quando existe o
 * pacote `ffmpeg-static` (dependência do api-server), usamos o binário dele
 * como fallback para os fluxos que chamam `ffmpeg` por nome — em especial a
 * montagem de vídeo a partir de fotos do Plano de Mídia.
 */
export function ensureFfmpegOnPath(): void {
  if (configured) return;
  configured = true;

  const candidates: string[] = [];
  const configuredPath = process.env["FFMPEG_PATH"]?.trim();
  if (configuredPath) candidates.push(configuredPath);

  try {
    const module = requireFromHere("ffmpeg-static") as string | null | { default?: string | null };
    const resolved = typeof module === "string" ? module : module?.default;
    if (resolved) candidates.push(resolved);
  } catch {
    // Pacote opcional: segue com o ffmpeg do PATH.
  }

  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const directory = dirname(candidate);
    const current = (process.env["PATH"] ?? "").split(delimiter);
    if (!current.includes(directory)) {
      process.env["PATH"] = `${directory}${delimiter}${process.env["PATH"] ?? ""}`;
    }
    return;
  }
}
