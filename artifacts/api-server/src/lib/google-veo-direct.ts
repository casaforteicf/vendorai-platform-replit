import { GoogleAuth } from "google-auth-library";
import { Storage } from "@google-cloud/storage";
import type { Logger } from "pino";

type VeoModel = "veo-3.1-fast-generate-001" | "veo-3.1-generate-001";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const storage = new Storage();

function config() {
  const project = process.env["GOOGLE_CLOUD_PROJECT"]?.trim();
  const location = process.env["GOOGLE_CLOUD_LOCATION"]?.trim() || "us-central1";
  const storageUri = process.env["VENDORAI_VERTEX_VIDEO_GCS_URI"]?.trim();
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT not set");
  if (!storageUri?.startsWith("gs://")) throw new Error("VENDORAI_VERTEX_VIDEO_GCS_URI must be gs://...");
  return { project, location, storageUri: storageUri.replace(/\/$/, "") };
}

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google Vertex access token unavailable");
  return token.token;
}

async function vertexFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await accessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function parseGsUri(uri: string): { bucket: string; path: string } {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: match[1]!, path: match[2]! };
}

function firstVideoUri(data: any): string | null {
  const candidates = [
    data?.response?.videos?.[0]?.gcsUri,
    data?.response?.generatedVideos?.[0]?.video?.uri,
    data?.response?.generatedSamples?.[0]?.video?.uri,
    data?.response?.generatedSamples?.[0]?.gcsUri,
    data?.result?.videos?.[0]?.gcsUri,
  ];
  return candidates.find((value) => typeof value === "string" && value.startsWith("gs://")) ?? null;
}

export async function callGoogleVertexVeo(params: {
  prompt: string;
  model: VeoModel;
  aspectRatio?: "16:9" | "9:16";
  duration?: 4 | 6 | 8;
  resolution?: "720p" | "1080p";
  negativePrompt?: string;
  image?: string;
  logger?: Logger;
}): Promise<{ buffer: Buffer; operationId: string; model: VeoModel; provider: "google-vertex" }> {
  const { project, location, storageUri } = config();
  const base = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${params.model}`;
  const outputUri = `${storageUri}/vendorai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance: Record<string, unknown> = { prompt: params.prompt };

  if (params.image) {
    const match = params.image.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("Google Vertex image-to-video requires a base64 data URL");
    instance["image"] = {
      bytesBase64Encoded: match[2],
      mimeType: match[1],
    };
  }

  const parameters: Record<string, unknown> = {
    storageUri: outputUri,
    sampleCount: 1,
    aspectRatio: params.aspectRatio ?? "16:9",
    durationSeconds: params.duration ?? 8,
    resolution: params.resolution ?? "720p",
  };
  if (params.negativePrompt) parameters["negativePrompt"] = params.negativePrompt;

  params.logger?.info({ provider: "google-vertex", model: params.model }, "Veo direct: submitting");
  const create = await vertexFetch(`${base}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({ instances: [instance], parameters }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!create.ok) {
    const body = await create.text().catch(() => "");
    throw new Error(`Google Vertex Veo HTTP ${create.status}: ${body}`);
  }
  const created = await create.json() as { name?: string };
  if (!created.name) throw new Error("Google Vertex Veo returned no operation name");

  let final: any = null;
  for (let polls = 0; polls < 180; polls += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 4000));
    const status = await vertexFetch(`${base}:fetchPredictOperation`, {
      method: "POST",
      body: JSON.stringify({ operationName: created.name }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!status.ok) throw new Error(`Google Vertex Veo status unavailable (${status.status})`);
    final = await status.json();
    if (final?.done === true) break;
  }
  if (!final?.done) throw new Error("Google Vertex Veo polling timeout");
  if (final?.error) throw new Error(`Google Vertex Veo failed: ${JSON.stringify(final.error)}`);

  const uri = firstVideoUri(final);
  if (!uri) throw new Error("Google Vertex Veo completed without a GCS video URI");
  const { bucket, path } = parseGsUri(uri);
  const [buffer] = await storage.bucket(bucket).file(path).download();
  if (!buffer.length) throw new Error("Google Vertex Veo generated an empty video");

  return {
    buffer,
    operationId: created.name,
    model: params.model,
    provider: "google-vertex",
  };
}
