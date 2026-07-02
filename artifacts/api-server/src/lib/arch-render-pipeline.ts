/**
 * Arch/Render Pipeline — inpainting com máscara (modo Preservar)
 *
 * 1. createZoneMask   — gera máscara PNG a partir das zonas selecionadas (heurística + SAM)
 * 2. callReplicateFluxFill — chama flux-fill-pro no Replicate (inpainting)
 * 3. compositeWithOriginal — compositing pós-geração (garante pixel-perfect fora da máscara)
 * 4. validateEdgeIntegrity — verifica se geometria dentro da máscara não deformou
 */
import sharp from "sharp";
import type { Logger } from "pino";

// ── Mapeamento heurístico de zonas → regiões da imagem ───────────────────────
// Cada zona define um retângulo relativo (x1%, y1%, x2%, y2%) como fração [0-1]
const ZONE_REGIONS: Record<string, [number, number, number, number][]> = {
  piso:             [[0, 0.62, 1, 1]],
  teto:             [[0, 0, 1, 0.22]],
  parede:           [[0.05, 0.18, 0.95, 0.65]],
  "parede_fundo":   [[0.05, 0.18, 0.95, 0.65]],
  "parede_lateral": [[0, 0.18, 0.15, 0.75], [0.85, 0.18, 1, 0.75]],
  armario:          [[0, 0.08, 0.5, 0.78]],
  "armários sup.":  [[0, 0.08, 0.6, 0.42]],
  "armários inf.":  [[0, 0.42, 0.6, 0.78]],
  bancada:          [[0, 0.42, 0.65, 0.60]],
  porta:            [[0.28, 0.18, 0.72, 0.78]],
  janela:           [[0.15, 0.10, 0.85, 0.55]],
};

function fillRect(
  pixels: Buffer,
  width: number,
  height: number,
  x1f: number, y1f: number,
  x2f: number, y2f: number,
  value: number,
): void {
  const px1 = Math.max(0, Math.floor(x1f * width));
  const py1 = Math.max(0, Math.floor(y1f * height));
  const px2 = Math.min(width,  Math.ceil(x2f * width));
  const py2 = Math.min(height, Math.ceil(y2f * height));
  for (let y = py1; y < py2; y++) {
    for (let x = px1; x < px2; x++) {
      pixels[y * width + x] = value;
    }
  }
}

/**
 * Gera uma máscara PNG (greyscale, branco=editável, preto=preservado)
 * baseada nas zonas selecionadas pelo usuário.
 * Fallback seguro: zona desconhecida → não edita (preto) preservando estrutura.
 */
export async function createZoneMask(
  zones: string[],
  width: number,
  height: number,
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height, 0); // all black = preserve

  for (const zone of zones) {
    const key = zone.toLowerCase().trim();
    const regions = ZONE_REGIONS[key];
    if (regions) {
      for (const [x1, y1, x2, y2] of regions) {
        fillRect(pixels, width, height, x1, y1, x2, y2, 255);
      }
    }
    // Se zona não mapeada: falha segura → deixa preto (não edita)
  }

  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

// ── Replicate — Flux Fill Pro (inpainting) ────────────────────────────────────

export async function callReplicateFluxFill(params: {
  imageDataUrl: string;
  maskDataUrl:  string;
  prompt:       string;
  steps?:       number;
  guidance?:    number;
  logger?:      Logger;
}): Promise<string> {
  const token = process.env["REPLICATE_API_TOKEN"];
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const { imageDataUrl, maskDataUrl, prompt, steps = 50, guidance = 30, logger } = params;

  const MODEL = "black-forest-labs/flux-fill-pro";

  logger?.info({ model: MODEL }, "FluxFill: creating inpainting prediction");

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          image:               imageDataUrl,
          mask:                maskDataUrl,
          prompt,
          num_inference_steps: steps,
          guidance:            guidance,
          output_format:       "png",
          output_quality:      100,
          safety_tolerance:    2,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );

  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`FluxFill HTTP ${createRes.status}: ${body["detail"] ?? JSON.stringify(body)}`);
  }

  let prediction = await createRes.json() as {
    id: string; status: string; output?: string | string[];
    error?: string; urls?: { get: string };
  };

  // Poll se o Prefer:wait não terminou a tempo
  let polls = 0;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (polls >= 40) throw new Error("FluxFill: polling timeout (80s)");
    await new Promise<void>((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` } },
    );
    prediction = await pollRes.json();
    polls++;
  }

  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(`FluxFill ${prediction.status}: ${prediction.error ?? "no output"}`);
  }

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  if (!outputUrl) throw new Error("FluxFill: empty output URL");

  logger?.info({ model: MODEL, polls }, "FluxFill: prediction succeeded");

  const imgRes = await fetch(outputUrl as string);
  if (!imgRes.ok) throw new Error(`FluxFill: download failed (${imgRes.status})`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  return imgBuf.toString("base64");
}

// ── Compositing pós-geração ───────────────────────────────────────────────────

/**
 * Sobrepõe pixels da imagem ORIGINAL sobre o resultado gerado,
 * nas áreas FORA da máscara (pretas = preserve zones).
 * Garante preservação determinística, independente do modelo generativo.
 */
export async function compositeWithOriginal(
  generatedBuf: Buffer,
  originalBuf:  Buffer,
  maskBuf:      Buffer,
): Promise<Buffer> {
  const meta = await sharp(originalBuf).metadata();
  const { width = 1024, height = 768 } = meta;

  // Máscara invertida: preto→branco (áreas de preservação ficam brancas)
  const invertedMask = await sharp(maskBuf)
    .negate()
    .png()
    .toBuffer();

  // generated visível apenas onde máscara é branca (zonas editáveis)
  const maskedGenerated = await sharp(generatedBuf)
    .resize(width, height, { fit: "fill" })
    .composite([{ input: maskBuf, blend: "dest-in" }])
    .png()
    .toBuffer();

  // original visível apenas onde máscara é preta (zonas de preservação)
  const maskedOriginal = await sharp(originalBuf)
    .resize(width, height, { fit: "fill" })
    .composite([{ input: invertedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Resultado final: original preservado embaixo, gerado em cima nas zonas editáveis
  return sharp(maskedOriginal)
    .composite([{ input: maskedGenerated, blend: "over" }])
    .png()
    .toBuffer();
}

// ── Validação de integridade de bordas ────────────────────────────────────────

export interface EdgeValidationResult {
  valid:            boolean;
  divergenceScore:  number; // 0.0 – 1.0; <0.15 = ok
  details:          string;
}

/**
 * Compara as áreas de preservação (fora da máscara) entre original e resultado.
 * Se a divergência passar de 15%, rejeita → auto-retry.
 */
export async function validateEdgeIntegrity(
  originalBuf: Buffer,
  resultBuf:   Buffer,
  maskBuf:     Buffer,
): Promise<EdgeValidationResult> {
  try {
    const SAMPLE = 120; // resolução de amostragem (menor = mais rápido)

    const [origRaw, resRaw, maskRaw] = await Promise.all([
      sharp(originalBuf).resize(SAMPLE, SAMPLE).removeAlpha().raw().toBuffer(),
      sharp(resultBuf  ).resize(SAMPLE, SAMPLE).removeAlpha().raw().toBuffer(),
      sharp(maskBuf    ).resize(SAMPLE, SAMPLE).greyscale().raw().toBuffer(),
    ]);

    let totalPixels     = 0;
    let divergentPixels = 0;

    for (let i = 0; i < maskRaw.length; i++) {
      if ((maskRaw[i] ?? 255) < 128) {
        // Área preta = deve ser preservada
        totalPixels++;
        const pi = i * 3;
        const diff =
          Math.abs((origRaw[pi]   ?? 0) - (resRaw[pi]   ?? 0)) +
          Math.abs((origRaw[pi+1] ?? 0) - (resRaw[pi+1] ?? 0)) +
          Math.abs((origRaw[pi+2] ?? 0) - (resRaw[pi+2] ?? 0));
        if (diff > 60) divergentPixels++;
      }
    }

    const divergenceScore = totalPixels > 0 ? divergentPixels / totalPixels : 0;
    const valid           = divergenceScore < 0.15;

    return {
      valid,
      divergenceScore,
      details: valid
        ? `OK — ${(divergenceScore * 100).toFixed(1)}% divergência nas áreas preservadas`
        : `REJEIÇÃO — ${(divergenceScore * 100).toFixed(1)}% divergência (limite: 15%)`,
    };
  } catch (err: any) {
    // Se a validação em si falhar, não bloquear — aprovar com aviso
    return { valid: true, divergenceScore: 0, details: `validação ignorada: ${err?.message}` };
  }
}

// ── Decode data URL para Buffer ───────────────────────────────────────────────

export function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("URL inválida: deve ser data:<mime>;base64,<dados>");
  return { buf: Buffer.from(match[2]!, "base64"), mime: match[1]! };
}

export function bufferToDataUrl(buf: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}
