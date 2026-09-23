import type { Logger } from "pino";

type BflResult = {
  status?: string;
  result?: { sample?: string };
  polling_url?: string;
  id?: string;
  detail?: unknown;
};

function apiKey(): string {
  const key = process.env["BFL_API_KEY"]?.trim();
  if (!key) throw new Error("BFL_API_KEY not set");
  return key;
}

async function pollBfl(pollingUrl: string, logger?: Logger): Promise<{ buffer: Buffer; requestId?: string }> {
  for (let polls = 0; polls < 240; polls += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 750));
    const response = await fetch(pollingUrl, {
      headers: { "x-key": apiKey(), accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`BFL polling HTTP ${response.status}`);
    const data = await response.json() as BflResult;
    const status = String(data.status ?? "").toLowerCase();
    if (status === "ready") {
      const url = data.result?.sample;
      if (!url) throw new Error("BFL returned Ready without result.sample");
      const imageResponse = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!imageResponse.ok) throw new Error(`BFL download failed (${imageResponse.status})`);
      return { buffer: Buffer.from(await imageResponse.arrayBuffer()), requestId: data.id };
    }
    if (["error", "failed", "request moderated", "content moderated"].includes(status)) {
      throw new Error(`BFL generation failed: ${data.status ?? "unknown"}`);
    }
  }
  throw new Error("BFL polling timeout");
}

async function submitBfl(endpoint: string, payload: Record<string, unknown>, logger?: Logger) {
  logger?.info({ provider: "bfl", endpoint }, "BFL direct: submitting generation");
  const response = await fetch(`https://api.bfl.ai/v1/${endpoint}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`BFL HTTP ${response.status}: ${body}`);
  }
  const data = await response.json() as BflResult;
  if (!data.polling_url) throw new Error("BFL response missing polling_url");
  return pollBfl(data.polling_url, logger);
}

export async function callBflKontextPro(params: {
  imageDataUrl: string;
  prompt: string;
  aspectRatio?: string;
  logger?: Logger;
}): Promise<string> {
  const result = await submitBfl("flux-kontext-pro", {
    prompt: params.prompt,
    input_image: params.imageDataUrl,
    aspect_ratio: params.aspectRatio ?? "4:3",
    output_format: "png",
    safety_tolerance: 2,
  }, params.logger);
  return result.buffer.toString("base64");
}

export async function callBflFlux2Pro(params: {
  prompt: string;
  width?: number;
  height?: number;
  logger?: Logger;
}): Promise<string> {
  const width = Math.max(64, Math.min(2048, Math.round((params.width ?? 1536) / 16) * 16));
  const height = Math.max(64, Math.min(2048, Math.round((params.height ?? 1024) / 16) * 16));
  const result = await submitBfl("flux-2-pro", {
    prompt: params.prompt,
    width,
    height,
    output_format: "png",
  }, params.logger);
  return result.buffer.toString("base64");
}
