import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { bufferToDataUrl } from "../lib/arch-render-pipeline.js";
import { generateVeoVideo } from "./media-provider-execution.js";
import { captureGeneratedMedia } from "./media-library.js";
import {
  authorizeVendorCredits,
  debitVendorCredits,
  refundVendorCredits,
  recordCommercialUsage,
} from "./commercial-usage.js";
import {
  ARQDOR_NEGATIVE_PROMPTS,
  buildArqdorRenderToVideoPrompt,
  type ArqdorVideoMovement,
} from "../lib/arqdor-render-prompts.js";

const execFileAsync = promisify(execFile);
const storage = new ObjectStorageService();

async function renderImageBuffer(url: string): Promise<{ buffer: Buffer; mime: string }> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("Render em data URL inválido");
    return { buffer: Buffer.from(match[2]!, "base64"), mime: match[1]! };
  }
  if (url.startsWith("/api/storage/objects/") || url.startsWith("/objects/")) {
    const rawPath = url.startsWith("/api/storage/objects/")
      ? `/objects/${url.slice("/api/storage/objects/".length)}`
      : url;
    const file = await storage.getObjectEntityFile(rawPath);
    const [[buffer], metadata] = await Promise.all([
      file.download(),
      file.getMetadata(),
    ]);
    if (!buffer.length) throw new Error("Não foi possível carregar o render salvo");
    return { buffer, mime: metadata[0].contentType ?? "image/png" };
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Falha ao carregar render (${response.status})`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get("content-type") ?? "image/png",
  };
}

async function trimToFiveSeconds(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "arqdor-video-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.mp4");
  try {
    await writeFile(inputPath, input);
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inputPath,
      "-t", "5",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-an",
      "-movflags", "+faststart",
      outputPath,
    ], { maxBuffer: 16 * 1024 * 1024 });
    const output = await readFile(outputPath);
    if (!output.length) throw new Error("FFmpeg retornou vídeo vazio");
    return output;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function startArqdorRenderVideo(input: {
  tenantId: string;
  renderId: string;
  movement: ArqdorVideoMovement;
  aspectRatio: "16:9" | "9:16";
  logger?: { info?: Function; warn?: Function; error?: Function };
}) {
  const renderResult = await pool.query(
    `SELECT id, result_image_url, status
       FROM arch_ai_renders
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1`,
    [input.renderId, input.tenantId],
  );
  const render = renderResult.rows[0];
  if (!render) throw new Error("RENDER_NOT_FOUND");
  if (render.status !== "concluido" || !render.result_image_url) throw new Error("RENDER_NOT_READY");

  const creditAuthorization = await authorizeVendorCredits(input.tenantId, "video", 1);
  if (!creditAuthorization.ok) {
    throw new Error(
      `INSUFFICIENT_VENDOR_CREDITS: required=${creditAuthorization.required} available=${creditAuthorization.includedRemaining + creditAuthorization.available}`,
    );
  }

  const insert = await pool.query(
    `INSERT INTO arch_render_videos (tenant_id, render_id, movement, aspect_ratio, status)
     VALUES ($1, $2, $3, $4, 'queued')
     RETURNING id`,
    [input.tenantId, input.renderId, input.movement, input.aspectRatio],
  );
  const jobId = String(insert.rows[0].id);
  const creditReferenceId = `arqdor-video:${jobId}`;
  const creditDebit = await debitVendorCredits({
    tenantId: input.tenantId,
    credits: creditAuthorization.walletRequired,
    commercialKey: "vendor.arqdor",
    referenceId: creditReferenceId,
    reason: "arqdor_render_video",
    metadata: { renderId: input.renderId, jobId, durationSeconds: 5, metricKey: "video" },
  });
  const reservedVendorCredits = Number(creditDebit.debited ?? 0);

  void (async () => {
    try {
      await pool.query(`UPDATE arch_render_videos SET status='running' WHERE id=$1 AND tenant_id=$2`, [jobId, input.tenantId]);
      const source = await renderImageBuffer(String(render.result_image_url));
      const generation = await generateVeoVideo({
        cinema: false,
        prompt: buildArqdorRenderToVideoPrompt(input.movement),
        image: bufferToDataUrl(source.buffer, source.mime),
        aspectRatio: input.aspectRatio,
        duration: 6,
        resolution: "720p",
        generateAudio: false,
        negativePrompt: ARQDOR_NEGATIVE_PROMPTS.video,
        logger: input.logger as any,
      });
      const fiveSeconds = await trimToFiveSeconds(generation.buffer);
      const captured = await captureGeneratedMedia({
        tenantId: input.tenantId,
        title: `Arqdor · vídeo do render ${input.renderId.slice(0, 8)}`,
        operation: "arqdor_render_video_5s",
        buffer: fiveSeconds,
        mimeType: "video/mp4",
        type: "video",
        originalFilename: `arqdor-render-${input.renderId}-${jobId}-5s.mp4`,
        kind: "video",
        metadata: {
          module: "arqdor",
          renderId: input.renderId,
          videoJobId: jobId,
          movement: input.movement,
          aspectRatio: input.aspectRatio,
          generatedByAi: true,
        },
      });
      const videoUrl = captured.storageUrl;

      await recordCommercialUsage({
        tenantId: input.tenantId,
        commercialKey: "vendor.arqdor",
        metricKey: "video",
        quantity: 1,
        success: true,
        billable: true,
        billingStatus: "overage",
        provider: generation.provider,
        model: generation.model,
        source: "arqdor_render_video",
        sourceEventId: `commercial:${jobId}`,
        requestId: jobId,
        metadata: {
          renderId: input.renderId,
          durationSeconds: 5,
          movement: input.movement,
          aspectRatio: input.aspectRatio,
          vendorCreditsReserved: reservedVendorCredits,
        },
      });

      await pool.query(
        `UPDATE arch_render_videos
            SET status='done', provider='replicate', model=$1, provider_prediction_id=$2,
                video_url=$3, completed_at=NOW(), error_message=NULL
          WHERE id=$4 AND tenant_id=$5`,
        [`${generation.provider}:${generation.model}`, generation.providerJobId, videoUrl, jobId, input.tenantId],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await recordCommercialUsage({
        tenantId: input.tenantId,
        commercialKey: "vendor.arqdor",
        metricKey: "video",
        quantity: 1,
        success: false,
        billable: true,
        billingStatus: "non_billable",
        source: "arqdor_render_video",
        sourceEventId: `commercial:${jobId}`,
        requestId: jobId,
        metadata: { renderId: input.renderId, error: message },
      }).catch(() => null);

      if (reservedVendorCredits > 0) {
        await refundVendorCredits({
          tenantId: input.tenantId,
          credits: reservedVendorCredits,
          commercialKey: "vendor.arqdor",
          referenceId: creditReferenceId,
          metadata: { renderId: input.renderId, jobId, providerFailure: true },
        }).catch(() => null);
      }

      input.logger?.error?.({ error, renderId: input.renderId, jobId }, "arqdor render video failed");
      await pool.query(
        `UPDATE arch_render_videos
            SET status='error', error_message=$1, completed_at=NOW()
          WHERE id=$2 AND tenant_id=$3`,
        [message, jobId, input.tenantId],
      ).catch(() => undefined);
    }
  })();

  return { jobId, status: "queued" as const };
}

export async function getArqdorRenderVideo(tenantId: string, jobId: string) {
  const result = await pool.query(
    `SELECT id, render_id, movement, aspect_ratio, status, model, video_url, error_message, created_at, completed_at
       FROM arch_render_videos
      WHERE id=$1 AND tenant_id=$2
      LIMIT 1`,
    [jobId, tenantId],
  );
  return result.rows[0] ?? null;
}
