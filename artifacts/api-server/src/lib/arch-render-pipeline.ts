/**
 * Arch/Render Pipeline — motores validados em 02/07/2026
 *
 * Modo Preservar  → flux-kontext-pro (edição por instrução de linguagem natural)
 *   Preserva layout, cor e identidade dos objetos por padrão; só aplica a
 *   transformação de estilo pedida no prompt. Não usa máscara.
 *
 * Modo Criar      → flux-1.1-pro-ultra raw:true (geração livre, sem input_image)
 *
 * Ajuste pontual  → flux-fill-pro com máscara (refinamento de elemento específico
 *   após geração inicial — segunda chamada separada, nunca combinada com Kontext)
 */
import sharp from "sharp";
import type { Logger } from "pino";

// ── Mapeamento heurístico de zonas → regiões da imagem ───────────────────────
// Mantido para ajuste pós-geração via Fill Pro (máscara de elemento pontual)
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
 * Gera máscara PNG a partir de coordenadas reais de retângulo desenhadas
 * pelo usuário (x,y,w,h em porcentagem 0-100, mesma convenção do
 * SelectionCanvas no frontend) — seleção livre de verdade, não mais só o
 * mapa heurístico de 5 zonas fixas.
 */
export async function createRectMask(
  rects: { x: number; y: number; w: number; h: number }[],
  width: number,
  height: number,
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height, 0); // all black = preserve

  for (const r of rects) {
    fillRect(pixels, width, height, r.x / 100, r.y / 100, (r.x + r.w) / 100, (r.y + r.h) / 100, 255);
  }

  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/**
 * Gera máscara PNG (greyscale, branco=editável, preto=preservado)
 * baseada nas zonas selecionadas. Usada exclusivamente no ajuste pontual
 * via Fill Pro — não na geração inicial do Kontext.
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
  }

  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

// ── Motor principal: Flux Kontext Pro (Modo Preservar) ────────────────────────
//
// Opera sobre os pixels reais da imagem original — layout, cor, material
// e identidade dos objetos ficam preservados por padrão; só aplica a
// transformação onde o prompt instrui explicitamente.

export async function callReplicateFluxKontext(params: {
  imageDataUrl: string;
  prompt:       string;
  steps?:       number;
  guidance?:    number;
  aspectRatio?: string;
  logger?:      Logger;
  signal?: AbortSignal;
  resumePredictionId?: string;
  beforeSubmit?: () => Promise<void>;
  onPredictionCreated?: (id: string) => Promise<void>;
}): Promise<string> {
  const token = process.env["REPLICATE_API_TOKEN"];
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const { imageDataUrl, prompt, steps = 50, guidance = 3.5, logger } = params;

  const MODEL = "black-forest-labs/flux-kontext-pro";

  logger?.info({ model: MODEL }, "FluxKontext: creating prediction");

  const requestSignal = (timeoutMs: number) => params.signal
    ? AbortSignal.any([params.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  type Prediction = { id: string; status: string; output?: string | string[]; error?: string };
  let prediction: Prediction;
  if (params.resumePredictionId) {
    const resumed = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(params.resumePredictionId)}`, {
      headers: { Authorization: `Token ${token}` }, signal: requestSignal(30_000),
    });
    if (!resumed.ok) throw new Error(`FluxKontext: falha ao recuperar geração (${resumed.status})`);
    prediction = await resumed.json() as Prediction;
  } else {
    await params.beforeSubmit?.();
    const createRes = await fetch(
      `https://api.replicate.com/v1/models/${MODEL}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization:  `Token ${token}`,
          "Content-Type": "application/json",
          ...(params.onPredictionCreated ? {} : { Prefer: "wait=60" }),
        },
        body: JSON.stringify({
          input: {
            input_image:         imageDataUrl,
            prompt,
            steps,
            guidance,
            ...(params.aspectRatio ? { aspect_ratio: params.aspectRatio } : {}),
            output_format:       "png",
            output_quality:      100,
            safety_tolerance:    2,
          },
        }),
        signal: requestSignal(120_000),
      },
    );

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
      const detail = String(body["detail"] ?? JSON.stringify(body));
      logger?.error({ model: MODEL, status: createRes.status, detail }, "FluxKontext: falha ao criar geração");
      // Esta mensagem vai direto pra tela do usuário (erro_msg). Antes aparecia o texto cru
      // do Replicate em inglês, com link de cobrança da conta da plataforma.
      if (createRes.status === 402) {
        throw new Error("O gerador de imagens está temporariamente indisponível (sem crédito). Avise o administrador da plataforma e tente de novo em alguns minutos.");
      }
      if (createRes.status === 429) {
        throw new Error("Muitos renders ao mesmo tempo. Aguarde cerca de um minuto e tente de novo.");
      }
      if (createRes.status === 401 || createRes.status === 403) {
        throw new Error("O gerador de imagens recusou a autenticação da plataforma. Avise o administrador.");
      }
      if (createRes.status === 422) {
        throw new Error("A imagem de referência não foi aceita pelo gerador. Ajuste a vista (fachada ou 3D) e tente de novo.");
      }
      throw new Error(`O gerador de imagens falhou (código ${createRes.status}). Tente de novo em instantes.`);
    }

    prediction = await createRes.json() as Prediction;
    if (!prediction.id) throw new Error("FluxKontext: resposta sem identificador de geração");
    await params.onPredictionCreated?.(prediction.id);
  }

  let polls = 0;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (polls >= 120) throw new Error("FluxKontext: polling timeout (240s)");
    await new Promise<void>((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` }, signal: requestSignal(30_000) },
    );
    if (!pollRes.ok) throw new Error(`FluxKontext: status indisponível (${pollRes.status})`);
    prediction = await pollRes.json() as typeof prediction;
    polls++;
  }

  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(`FluxKontext ${prediction.status}: ${prediction.error ?? "no output"}`);
  }

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  if (!outputUrl) throw new Error("FluxKontext: empty output URL");

  logger?.info({ model: MODEL, polls }, "FluxKontext: prediction succeeded");

  const imgRes = await fetch(outputUrl as string, { signal: requestSignal(60_000) });
  if (!imgRes.ok) throw new Error(`FluxKontext: download failed (${imgRes.status})`);
  return Buffer.from(await imgRes.arrayBuffer()).toString("base64");
}

// ── Motor de geração livre: Flux 1.1 Pro Ultra raw:true (Modo Criar) ──────────

export async function callReplicateFluxUltraPro(params: {
  prompt:   string;
  steps?:   number;
  logger?:  Logger;
}): Promise<string> {
  const token = process.env["REPLICATE_API_TOKEN"];
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const { prompt, steps = 50, logger } = params;

  const MODEL = "black-forest-labs/flux-1.1-pro-ultra";

  logger?.info({ model: MODEL }, "FluxUltraPro: creating prediction");

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization:  `Token ${token}`,
        "Content-Type": "application/json",
        Prefer:         "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          raw:            true, // sem pós-processamento estético — fidelidade ao prompt
          output_format:  "png",
          output_quality: 100,
          safety_tolerance: 2,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );

  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`FluxUltraPro HTTP ${createRes.status}: ${body["detail"] ?? JSON.stringify(body)}`);
  }

  let prediction = await createRes.json() as {
    id: string; status: string; output?: string | string[];
    error?: string;
  };

  let polls = 0;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (polls >= 60) throw new Error("FluxUltraPro: polling timeout (120s)");
    await new Promise<void>((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` } },
    );
    prediction = await pollRes.json() as typeof prediction;
    polls++;
  }

  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(`FluxUltraPro ${prediction.status}: ${prediction.error ?? "no output"}`);
  }

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  if (!outputUrl) throw new Error("FluxUltraPro: empty output URL");

  logger?.info({ model: MODEL, polls }, "FluxUltraPro: prediction succeeded");

  const imgRes = await fetch(outputUrl as string);
  if (!imgRes.ok) throw new Error(`FluxUltraPro: download failed (${imgRes.status})`);
  return Buffer.from(await imgRes.arrayBuffer()).toString("base64");
}

// ── Motor de geração por prompt: Flux 1.1 Pro (Content Studio) ───────────────
// Geração puramente textual (sem input_image). Suporta aspect_ratio nativo,
// prompt_upsampling e output_format="jpg". Reaproveitado no Content Studio.

export async function callReplicateFlux11Pro(params: {
  prompt:       string;
  aspectRatio?: string;
  logger?:      Logger;
}): Promise<string> {
  const token = process.env["REPLICATE_API_TOKEN"];
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const { prompt, aspectRatio = "1:1", logger } = params;
  const MODEL = "black-forest-labs/flux-1.1-pro";

  logger?.info({ model: MODEL, aspectRatio }, "Flux1Pro: creating prediction");

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization:  `Token ${token}`,
        "Content-Type": "application/json",
        Prefer:         "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio:      aspectRatio,
          output_format:     "jpg",
          prompt_upsampling: true,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );

  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`Flux1Pro HTTP ${createRes.status}: ${body["detail"] ?? JSON.stringify(body)}`);
  }

  let prediction = await createRes.json() as {
    id: string; status: string; output?: string | string[]; error?: string;
  };

  let polls = 0;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (polls >= 60) throw new Error("Flux1Pro: polling timeout (120s)");
    await new Promise<void>((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` } },
    );
    prediction = await pollRes.json() as typeof prediction;
    polls++;
  }

  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(`Flux1Pro ${prediction.status}: ${prediction.error ?? "no output"}`);
  }

  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outputUrl) throw new Error("Flux1Pro: empty output URL");

  logger?.info({ model: MODEL, polls }, "Flux1Pro: prediction succeeded");
  return outputUrl as string; // Replicate CDN URL — caller must persist it
}

// ── Motor de ajuste pontual: Flux Fill Pro (segunda chamada sobre resultado) ───
// Usado exclusivamente em ajuste pós-geração de elemento específico,
// nunca combinado com o Kontext no mesmo fluxo.

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
        Authorization:  `Token ${token}`,
        "Content-Type": "application/json",
        Prefer:         "wait=60",
      },
      body: JSON.stringify({
        input: {
          image:               imageDataUrl,
          mask:                maskDataUrl,
          prompt,
          num_inference_steps: steps,
          guidance,
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

  let polls = 0;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (polls >= 40) throw new Error("FluxFill: polling timeout (80s)");
    await new Promise<void>((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` } },
    );
    prediction = await pollRes.json() as typeof prediction;
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
  return Buffer.from(await imgRes.arrayBuffer()).toString("base64");
}

// ── Compositing pós-geração ───────────────────────────────────────────────────
// Mantido como camada extra de garantia para ajuste via Fill Pro.

export async function compositeWithOriginal(
  generatedBuf: Buffer,
  originalBuf:  Buffer,
  maskBuf:      Buffer,
): Promise<Buffer> {
  const meta = await sharp(originalBuf).metadata();
  const { width = 1024, height = 768 } = meta;

  const invertedMask = await sharp(maskBuf).negate().png().toBuffer();

  const maskedGenerated = await sharp(generatedBuf)
    .resize(width, height, { fit: "fill" })
    .composite([{ input: maskBuf, blend: "dest-in" }])
    .png()
    .toBuffer();

  const maskedOriginal = await sharp(originalBuf)
    .resize(width, height, { fit: "fill" })
    .composite([{ input: invertedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp(maskedOriginal)
    .composite([{ input: maskedGenerated, blend: "over" }])
    .png()
    .toBuffer();
}

// ── Validação de integridade ───────────────────────────────────────────────────

export interface EdgeValidationResult {
  valid:            boolean;
  divergenceScore:  number;
  details:          string;
}

export type ArchitecturalStructureValidation = {
  valid: boolean;
  score: number;
  edgeCoverage: number;
  mirroredCoverage: number;
  centroidShift: number;
  details: string;
};

async function structuralEdgeMap(buf: Buffer, width = 192, height = 128) {
  const { data } = await sharp(buf)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const gradients = new Float32Array(width * height);
  const values: number[] = [];
  let total = 0;
  let cxWeighted = 0;
  let cyWeighted = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (x < width * 0.04 || x > width * 0.96 || y < height * 0.08 || y > height * 0.92) continue;
      const i = y * width + x;
      const gx = Math.abs((data[i + 1] ?? 0) - (data[i - 1] ?? 0));
      const gy = Math.abs((data[i + width] ?? 0) - (data[i - width] ?? 0));
      const g = gx + gy;
      gradients[i] = g;
      if (g > 0) values.push(g);
    }
  }

  values.sort((a, b) => a - b);
  const threshold = values.length
    ? Math.max(20, values[Math.max(0, Math.floor(values.length * 0.82) - 1)] ?? 20)
    : 20;
  const edge = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (gradients[i] < threshold) continue;
      edge[i] = 1;
      const w = gradients[i];
      total += w;
      cxWeighted += x * w;
      cyWeighted += y * w;
    }
  }

  return {
    width,
    height,
    edge,
    edgeCount: edge.reduce((sum, v) => sum + v, 0),
    centroid: total > 0
      ? { x: cxWeighted / total / width, y: cyWeighted / total / height }
      : { x: 0.5, y: 0.5 },
  };
}

function edgeCoverage(
  source: Uint8Array,
  target: Uint8Array,
  width: number,
  height: number,
  radius = 4,
  mirrorSource = false,
) {
  let hits = 0;
  let total = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const sourceX = mirrorSource ? width - 1 - x : x;
      if (!source[y * width + sourceX]) continue;
      total++;
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (target[yy * width + xx]) {
            found = true;
            break;
          }
        }
      }
      if (found) hits++;
    }
  }
  return total ? hits / total : 1;
}

/**
 * QA estrutural pós-render para fachada.
 *
 * Compara apenas a estrutura de bordas da referência e do resultado,
 * ignorando cor/material/fotorrealismo. É propositalmente tolerante:
 * o objetivo é capturar distorções grandes, espelhamento, crop agressivo
 * ou desaparecimento de elementos arquitetônicos, sem punir textura/luz.
 */
export async function validateArchitecturalStructure(
  originalBuf: Buffer,
  resultBuf: Buffer,
): Promise<ArchitecturalStructureValidation> {
  try {
    const [source, result] = await Promise.all([
      structuralEdgeMap(originalBuf),
      structuralEdgeMap(resultBuf),
    ]);

    if (source.edgeCount < 80 || result.edgeCount < 80) {
      return {
        valid: true,
        score: 1,
        edgeCoverage: 1,
        mirroredCoverage: 0,
        centroidShift: 0,
        details: "QA estrutural ignorado: poucas bordas úteis para comparação.",
      };
    }

    const coverage = edgeCoverage(source.edge, result.edge, source.width, source.height, 4, false);
    const mirroredCoverage = edgeCoverage(source.edge, result.edge, source.width, source.height, 4, true);
    const centroidShift = Math.hypot(
      source.centroid.x - result.centroid.x,
      source.centroid.y - result.centroid.y,
    );
    const mirrorRisk = mirroredCoverage > coverage + 0.07;
    const score = Math.max(
      0,
      Math.min(1, coverage * 0.82 + Math.max(0, 1 - centroidShift / 0.24) * 0.18),
    );

    const valid = coverage >= 0.5 && centroidShift <= 0.18 && !mirrorRisk;
    return {
      valid,
      score,
      edgeCoverage: coverage,
      mirroredCoverage,
      centroidShift,
      details: valid
        ? `OK — score ${(score * 100).toFixed(0)}%, cobertura estrutural ${(coverage * 100).toFixed(0)}%.`
        : `REJEIÇÃO — score ${(score * 100).toFixed(0)}%, cobertura ${(coverage * 100).toFixed(0)}%, espelhada ${(mirroredCoverage * 100).toFixed(0)}%, deslocamento ${(centroidShift * 100).toFixed(1)}%.`,
    };
  } catch (err: any) {
    return {
      valid: true,
      score: 1,
      edgeCoverage: 1,
      mirroredCoverage: 0,
      centroidShift: 0,
      details: `QA estrutural ignorado: ${err?.message ?? "falha desconhecida"}`,
    };
  }
}


export async function validateColorStability(
  originalBuf: Buffer,
  resultBuf: Buffer,
): Promise<{ valid: boolean; meanDelta: number; details: string }> {
  try {
    const [sourceStats, resultStats] = await Promise.all([
      sharp(originalBuf).removeAlpha().resize(256, 256, { fit: "fill" }).stats(),
      sharp(resultBuf).removeAlpha().resize(256, 256, { fit: "fill" }).stats(),
    ]);

    const sourceMeans = sourceStats.channels.slice(0, 3).map((channel) => channel.mean);
    const resultMeans = resultStats.channels.slice(0, 3).map((channel) => channel.mean);
    const deltas = sourceMeans.map((value, index) => Math.abs(value - (resultMeans[index] ?? value)));
    const meanDelta = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);

    // A iluminação pode mudar highlights e sombras, mas uma deriva média grande
    // costuma indicar recoloração global do projeto. O limite é intencionalmente
    // tolerante para não bloquear cenas diurnas/noturnas legítimas.
    const valid = meanDelta <= 34;
    return {
      valid,
      meanDelta,
      details: valid
        ? `OK — deriva média de cor ${meanDelta.toFixed(1)}.`
        : `REJEIÇÃO — deriva média de cor ${meanDelta.toFixed(1)} (limite: 34).`,
    };
  } catch (err: any) {
    return { valid: true, meanDelta: 0, details: `QA de cor ignorado: ${err?.message ?? "falha desconhecida"}` };
  }
}

export async function validateEdgeIntegrity(
  originalBuf: Buffer,
  resultBuf:   Buffer,
  maskBuf:     Buffer,
): Promise<EdgeValidationResult> {
  try {
    const SAMPLE = 120;

    const [origRaw, resRaw, maskRaw] = await Promise.all([
      sharp(originalBuf).resize(SAMPLE, SAMPLE).removeAlpha().raw().toBuffer(),
      sharp(resultBuf  ).resize(SAMPLE, SAMPLE).removeAlpha().raw().toBuffer(),
      sharp(maskBuf    ).resize(SAMPLE, SAMPLE).greyscale().raw().toBuffer(),
    ]);

    let totalPixels = 0, divergentPixels = 0;
    for (let i = 0; i < maskRaw.length; i++) {
      if ((maskRaw[i] ?? 255) < 128) {
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
    const valid = divergenceScore < 0.15;

    return {
      valid,
      divergenceScore,
      details: valid
        ? `OK — ${(divergenceScore * 100).toFixed(1)}% divergência nas áreas preservadas`
        : `REJEIÇÃO — ${(divergenceScore * 100).toFixed(1)}% divergência (limite: 15%)`,
    };
  } catch (err: any) {
    return { valid: true, divergenceScore: 0, details: `validação ignorada: ${err?.message}` };
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("URL inválida: deve ser data:<mime>;base64,<dados>");
  return { buf: Buffer.from(match[2]!, "base64"), mime: match[1]! };
}

export function bufferToDataUrl(buf: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}



export async function callReplicateVeo31(params: {
  prompt: string;
  model?: "google/veo-3.1" | "google/veo-3.1-lite";
  aspectRatio?: "16:9" | "9:16";
  duration?: 4 | 6 | 8;
  resolution?: "720p" | "1080p";
  generateAudio?: boolean;
  negativePrompt?: string;
  image?: string;
  lastFrame?: string;
  referenceImages?: string[];
  logger?: Logger;
}): Promise<{ buffer: Buffer; predictionId: string; model: string }> {
  const token = process.env["REPLICATE_API_TOKEN"];
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const MODEL = params.model ?? "google/veo-3.1";
  const { prompt, logger } = params;
  type Prediction = { id: string; status: string; output?: string | string[]; error?: string };

  const isRetryableVeoError = (message: string, status?: number) => {
    const normalized = message.toLowerCase();
    return status === 429
      || status === 500
      || status === 502
      || status === 503
      || status === 504
      || normalized.includes("high load")
      || normalized.includes("cannot process your request")
      || normalized.includes("try again later")
      || normalized.includes("resource exhausted")
      || normalized.includes("temporarily unavailable")
      || normalized.includes("overloaded");
  };

  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logger?.info({ model: MODEL, attempt, maxAttempts }, "Veo31: creating prediction");

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
              prompt,
              aspect_ratio: params.aspectRatio ?? "16:9",
              duration: params.duration ?? 8,
              resolution: params.resolution ?? "1080p",
              ...(MODEL === "google/veo-3.1" ? { generate_audio: params.generateAudio !== false } : {}),
              ...(MODEL === "google/veo-3.1" && params.negativePrompt ? { negative_prompt: params.negativePrompt } : {}),
              ...(params.image ? { image: params.image } : {}),
              ...(params.lastFrame ? { last_frame: params.lastFrame } : {}),
              ...(MODEL === "google/veo-3.1" && params.referenceImages?.length
                ? { reference_images: params.referenceImages.slice(0, 3) }
                : {}),
            },
          }),
          signal: AbortSignal.timeout(120_000),
        },
      );

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
        const detail = String(body["detail"] ?? JSON.stringify(body));
        const error = new Error(`Veo31 HTTP ${createRes.status}: ${detail}`);
        if (!isRetryableVeoError(detail, createRes.status) || attempt === maxAttempts) throw error;
        throw Object.assign(error, { retryable: true });
      }

      let prediction = await createRes.json() as Prediction;
      if (!prediction.id) throw new Error("Veo31: resposta sem identificador de geração");

      let polls = 0;
      while (prediction.status === "starting" || prediction.status === "processing") {
        if (polls >= 180) throw new Error("Veo31: polling timeout");
        await new Promise<void>((resolve) => setTimeout(resolve, 4000));
        const pollRes = await fetch(
          `https://api.replicate.com/v1/predictions/${prediction.id}`,
          {
            headers: { Authorization: `Token ${token}` },
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (!pollRes.ok) throw new Error(`Veo31: status indisponível (${pollRes.status})`);
        prediction = await pollRes.json() as Prediction;
        polls += 1;
      }

      if (prediction.status !== "succeeded" || !prediction.output) {
        const message = `Veo31 ${prediction.status}: ${prediction.error ?? "no output"}`;
        const error = new Error(message);
        if (!isRetryableVeoError(message) || attempt === maxAttempts) throw error;
        throw Object.assign(error, { retryable: true });
      }

      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) throw new Error("Veo31: empty output URL");

      const videoRes = await fetch(outputUrl, { signal: AbortSignal.timeout(120_000) });
      if (!videoRes.ok) throw new Error(`Veo31: download failed (${videoRes.status})`);
      const buffer = Buffer.from(await videoRes.arrayBuffer());
      if (!buffer.length) throw new Error("Veo31: empty video output");

      logger?.info({ model: MODEL, polls, predictionId: prediction.id, attempt }, "Veo31: prediction succeeded");
      return { buffer, predictionId: prediction.id, model: MODEL };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = (error as { retryable?: boolean } | null)?.retryable === true
        || isRetryableVeoError(lastError.message);
      if (!retryable || attempt === maxAttempts) throw lastError;

      const delayMs = Math.min(90_000, 12_000 * Math.pow(2, attempt - 1));
      logger?.warn(
        { err: lastError, attempt, maxAttempts, delayMs },
        "Veo31: provider busy; retrying automatically",
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error("Veo31: falha após tentativas automáticas");
}
