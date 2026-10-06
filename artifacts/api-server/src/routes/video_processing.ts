import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pool } from "@workspace/db";
import { objectStorageClient } from "../lib/objectStorage.js";
import { transcribeAudioWithWordTimestamps, type TranscriptionWord } from "../lib/ai-gateway.js";
import { analyzePcm16Beats } from "../lib/audio-beat-analysis.js";
import {
  createMediaJob,
  getMediaJob,
  updateMediaJob,
} from "../services/media-jobs.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
  setMediaProjectStatus,
} from "../services/media-library.js";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const PRIVATE_DIR    = process.env["PRIVATE_OBJECT_DIR"] ?? "";
function routeTenantId(req: any): string {
  // tenant-audit: reviewed tenant route; content-studio handlers enforce authCheck before tenant-scoped work.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

const VIDEO_EDITOR_EVENTS = new Set([
  "beat_analyzed",
  "beat_fallback_server",
  "render_started",
  "render_completed",
  "render_failed",
  "auto_edit_applied",
  "sfx_applied",
]);

function authCheck(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  const tenantId = routeTenantId(req);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return false;
  }
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveToBucket(buf: Buffer, contentType: string, name: string): Promise<string> {
  if (!PRIVATE_DIR) throw new Error("PRIVATE_OBJECT_DIR não configurado");
  const id  = randomUUID();
  const ext = name.split(".").pop()?.toLowerCase() ?? "mp4";
  const safeName = `${id}.${ext}`;
  const fullPath = `${PRIVATE_DIR}/videos/${safeName}`;
  const parts = fullPath.split("/");
  const bucket = objectStorageClient.bucket(parts[1]!);
  const file   = bucket.file(parts.slice(2).join("/"));
  await file.save(buf, { contentType, resumable: false });
  return `/objects/videos/${safeName}`;
}

/** Returns duration in seconds via ffprobe */
async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", filePath,
  ]);
  const data = JSON.parse(stdout) as { format?: { duration?: string } };
  return parseFloat(data.format?.duration ?? "0");
}

// ── Edição automática ─────────────────────────────────────────────────────────

router.post(
  "/tenants/:tenantId/content-studio/video/edit",
  upload.single("video"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    const tenantId = routeTenantId(req);
    const userId = req.user?.sub ?? null;
    const { removeSilence = "true", speed = "1.0", normalize = "false", loudnessTarget = "-14" } = req.body as Record<string, string>;
    const jobId = randomUUID();
    const projectId = await createProcessingMediaProject({
      tenantId,
      userId,
      title: `Edição de vídeo — ${req.file.originalname}`,
      operation: "video_edit",
      context: {
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        removeSilence,
        speed,
        normalize,
        loudnessTarget,
      },
    });
    await createMediaJob({
      id: jobId,
      tenantId,
      projectId,
      operation: "video_edit",
      input: { removeSilence, speed, normalize, loudnessTarget },
    });
    res.json({ jobId, projectId });

    void (async () => {
      const tmpDir  = tmpdir();
      const inPath  = join(tmpDir, `vp-in-${jobId}.mp4`);
      const outPath = join(tmpDir, `vp-out-${jobId}.mp4`);
      try {
        await writeFile(inPath, req.file!.buffer);

        const filters: string[] = [];

        if (removeSilence === "true") {
          filters.push(
            "silenceremove=start_periods=1:start_duration=0.2:start_threshold=-35dB:detection=peak",
            "silenceremove=stop_periods=-1:stop_duration=0.4:stop_threshold=-35dB:detection=peak"
          );
        }

        const spd = parseFloat(speed);
        const validSpeed = isNaN(spd) || spd <= 0 ? 1.0 : spd;

        const vFilters: string[] = [];
        const aFilters: string[] = [...filters];
        const parsedLoudnessTarget = parseFloat(loudnessTarget);
        const safeLoudnessTarget = Number.isFinite(parsedLoudnessTarget) ? Math.max(-24, Math.min(-8, parsedLoudnessTarget)) : -14;
        if (normalize === "true") aFilters.push(`loudnorm=I=${safeLoudnessTarget}:TP=-1.5:LRA=11`);

        const ffmpegArgs: string[] = ["-y", "-i", inPath];

        if (validSpeed !== 1.0 && aFilters.length === 0) {
          vFilters.push(`setpts=${(1 / validSpeed).toFixed(4)}*PTS`);
          aFilters.push(`atempo=${validSpeed.toFixed(4)}`);
        } else if (validSpeed !== 1.0) {
          vFilters.push(`setpts=${(1 / validSpeed).toFixed(4)}*PTS`);
          aFilters.push(`atempo=${validSpeed.toFixed(4)}`);
        }

        if (aFilters.length > 0 || vFilters.length > 0) {
          if (vFilters.length > 0 && aFilters.length > 0) {
            ffmpegArgs.push(
              "-filter_complex",
              `[0:v]${vFilters.join(",")}[v];[0:a]${aFilters.join(",")}[a]`,
              "-map", "[v]", "-map", "[a]"
            );
          } else if (aFilters.length > 0) {
            ffmpegArgs.push("-af", aFilters.join(","));
          } else if (vFilters.length > 0) {
            ffmpegArgs.push("-vf", vFilters.join(","));
          }
        }

        ffmpegArgs.push("-c:v", "libx264", "-c:a", "aac", "-preset", "fast", outPath);

        await execFileAsync("ffmpeg", ffmpegArgs);

        const buf = await readFile(outPath);
        const objPath = await saveToBucket(buf, "video/mp4", `edited-${jobId}.mp4`);
        await registerGeneratedMediaOutput({
          tenantId,
          projectId,
          userId,
          storageUrl: objPath,
          mimeType: "video/mp4",
          originalFilename: `edited-${req.file!.originalname}`,
          operation: "video_edit",
          label: "Vídeo editado",
          metadata: { jobId, removeSilence, speed, normalize, loudnessTarget },
        }).catch(async (libraryError) => {
          req.log.error({ err: libraryError, tenantId, projectId, jobId }, "media-library: failed to register edited video");
          await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        });
        await updateMediaJob(jobId, tenantId, { status: "done", videoUrl: objPath });
      } catch (err) {
        await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        await updateMediaJob(jobId, tenantId, {
          status: "error",
          error: err instanceof Error ? err.message : "Erro no processamento",
        }).catch(() => undefined);
      } finally {
        await unlink(inPath).catch(() => {});
        await unlink(outPath).catch(() => {});
      }
    })();
  }
);

// ── Clipes automáticos ────────────────────────────────────────────────────────

router.post(
  "/tenants/:tenantId/content-studio/video/clips",
  upload.single("video"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    const tenantId = routeTenantId(req);
    const userId = req.user?.sub ?? null;
    const { clipDuration = "60", maxClips = "4", convertTo9x16 = "false" } = req.body as Record<string, string>;
    const jobId = randomUUID();
    const projectId = await createProcessingMediaProject({
      tenantId,
      userId,
      title: `Clipes automáticos — ${req.file.originalname}`,
      operation: "video_clips",
      context: {
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        clipDuration,
        maxClips,
        convertTo9x16,
      },
    });
    await createMediaJob({
      id: jobId,
      tenantId,
      projectId,
      operation: "video_clips",
      input: { clipDuration, maxClips, convertTo9x16 },
      snapshot: { status: "running", progress: 0, total: 0 },
    });
    res.json({ jobId, projectId });

    void (async () => {
      const tmpDir = tmpdir();
      const inPath = join(tmpDir, `vc-in-${jobId}.mp4`);
      const clipPaths: string[] = [];
      try {
        await writeFile(inPath, req.file!.buffer);

        const duration = await getVideoDuration(inPath);
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new Error("Não foi possível determinar a duração do vídeo");
        }

        const requestedClipSec = parseInt(clipDuration, 10);
        const clipSec = Math.max(10, Math.min(90, Number.isFinite(requestedClipSec) ? requestedClipSec : 60));
        const requestedMaxClips = parseInt(maxClips, 10);
        const maxClipCount = Math.max(1, Math.min(8, Number.isFinite(requestedMaxClips) ? requestedMaxClips : 4));
        const nClips = Math.min(maxClipCount, Math.max(1, Math.ceil(duration / clipSec)));

        await updateMediaJob(jobId, tenantId, { status: "running", progress: 0, total: nClips });

        const clipUrls: string[] = [];

        for (let i = 0; i < nClips; i++) {
          const start = i * clipSec;
          const actualDuration = Math.min(clipSec, Math.max(0.1, duration - start));
          const outPath = join(tmpdir(), `vc-clip-${jobId}-${i}.mp4`);
          clipPaths.push(outPath);

          const ffmpegArgs: string[] = [
            "-y", "-i", inPath,
            "-ss", String(start), "-t", actualDuration.toFixed(3),
          ];

          if (convertTo9x16 === "true") {
            ffmpegArgs.push(
              "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
              "-c:v", "libx264", "-c:a", "aac", "-preset", "fast"
            );
          } else {
            ffmpegArgs.push("-c", "copy");
          }

          ffmpegArgs.push(outPath);
          await execFileAsync("ffmpeg", ffmpegArgs);

          const buf     = await readFile(outPath);
          const objPath = await saveToBucket(buf, "video/mp4", `clip-${jobId}-${i}.mp4`);
          clipUrls.push(`/api/storage${objPath}`);

          await registerGeneratedMediaOutput({
            tenantId,
            projectId,
            userId,
            storageUrl: objPath,
            mimeType: "video/mp4",
            originalFilename: `clip-${i + 1}-${req.file!.originalname}`,
            operation: "video_clip",
            label: `Clipe ${i + 1}`,
            metadata: { jobId, clipIndex: i, start, duration: actualDuration, convertTo9x16 },
          }).catch((libraryError) => {
            req.log.error({ err: libraryError, tenantId, projectId, jobId, clipIndex: i }, "media-library: failed to register clip");
          });

          await updateMediaJob(jobId, tenantId, { status: "running", progress: i + 1, total: nClips });
        }

        await setMediaProjectStatus(tenantId, projectId, clipUrls.length > 0 ? "ready" : "draft").catch(() => undefined);
        await updateMediaJob(jobId, tenantId, {
          status: "done",
          clips: clipUrls,
          progress: nClips,
          total: nClips,
        });
      } catch (err) {
        await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        await updateMediaJob(jobId, tenantId, {
          status: "error",
          error: err instanceof Error ? err.message : "Erro no processamento",
        }).catch(() => undefined);
      } finally {
        await unlink(inPath).catch(() => {});
        for (const p of clipPaths) await unlink(p).catch(() => {});
      }
    })();
  }
);

// ── Vídeo em lote ─────────────────────────────────────────────────────────────
// O lote será reativado quando video_generate, voice_profile e persona_profile
// próprios estiverem prontos no VendorAI Media Engine.
router.post("/tenants/:tenantId/content-studio/video/batch", async (req, res) => {
  if (!authCheck(req, res)) return;
  res.status(409).json({
    error: "Vídeo em lote está sendo migrado para o VendorAI Media Engine próprio.",
    provider: "vendorai",
    operation: "video_batch",
    status: "building",
  });
});

// ── Legendagem automática ─────────────────────────────────────────────────────
// Transcreve o áudio com timestamp por palavra (Whisper) e queima a
// legenda no vídeo via ffmpeg (filtro ass). O visual é definido pelo
// Brand Video Kit ativo do tenant, preservando reels_bold como fallback.

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

const MAX_WORDS_PER_CAPTION = 5;
const MAX_PAUSE_GAP_SECONDS = 0.6;
type CaptionPreset = "reels_bold" | "clean" | "highlight" | "minimal";

type CaptionStyle = {
  fontSize: number;
  primaryColour: string;
  outlineColour: string;
  bold: 0 | 1;
  outline: number;
  shadow: number;
  marginV: number;
  uppercase: boolean;
};

const CAPTION_STYLES: Record<CaptionPreset, CaptionStyle> = {
  reels_bold: {
    fontSize: 88,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    bold: 1,
    outline: 6,
    shadow: 0,
    marginV: 220,
    uppercase: true,
  },
  clean: {
    fontSize: 64,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    bold: 0,
    outline: 3,
    shadow: 0,
    marginV: 180,
    uppercase: false,
  },
  highlight: {
    fontSize: 76,
    primaryColour: "&H0000FFFF",
    outlineColour: "&H00000000",
    bold: 1,
    outline: 5,
    shadow: 0,
    marginV: 210,
    uppercase: true,
  },
  minimal: {
    fontSize: 54,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    bold: 0,
    outline: 2,
    shadow: 0,
    marginV: 150,
    uppercase: false,
  },
};

async function resolveBrandCaptionPreset(tenantId: string): Promise<CaptionPreset> {
  const result = await pool.query(
    `SELECT caption_preset
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [tenantId],
  );
  const preset = String(result.rows[0]?.caption_preset ?? "reels_bold") as CaptionPreset;
  return preset in CAPTION_STYLES ? preset : "reels_bold";
}

type EditableCaptionChunk = {
  start: number;
  end: number;
  text: string;
  words: TranscriptionWord[];
};

function buildCaptionChunks(words: TranscriptionWord[]): EditableCaptionChunk[] {
  const chunks: EditableCaptionChunk[] = [];
  let current: TranscriptionWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      text: current.map((w) => w.word).join(" ").trim(),
      words: current.map((word) => ({ ...word })),
    });
    current = [];
  };

  for (const w of words) {
    const prev = current[current.length - 1];
    const gap = prev ? w.start - prev.end : 0;
    if (current.length >= MAX_WORDS_PER_CAPTION || (prev && gap > MAX_PAUSE_GAP_SECONDS)) {
      flush();
    }
    current.push(w);
  }
  flush();
  return chunks;
}

function buildAssSubtitle(
  chunks: { start: number; end: number; text: string }[],
  preset: CaptionPreset,
): string {
  const style = CAPTION_STYLES[preset];
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Liberation Sans,${style.fontSize},${style.primaryColour},${style.outlineColour},&H00000000,${style.bold},0,1,${style.outline},${style.shadow},2,60,60,${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = chunks
    .map((c) => {
      const text = style.uppercase ? c.text.toUpperCase() : c.text;
      return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${escapeAssText(text)}`;
    })
    .join("\n");
  return header + lines;
}

router.post(
  "/tenants/:tenantId/content-studio/video/transcribe",
  upload.single("video"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    const tenantId = routeTenantId(req);
    const captionPreset = await resolveBrandCaptionPreset(tenantId);
    const jobId = randomUUID();
    await createMediaJob({
      id: jobId,
      tenantId,
      operation: "video_transcribe",
      input: { captionPreset, originalFilename: req.file.originalname },
      snapshot: { status: "running", progress: 0, total: 3 },
    });
    res.status(202).json({ jobId, captionPreset });

    void (async () => {
      const inPath = join(tmpdir(), `transcribe-in-${jobId}.mp4`);
      const audioPath = join(tmpdir(), `transcribe-audio-${jobId}.wav`);
      try {
        await writeFile(inPath, req.file!.buffer);
        await updateMediaJob(jobId, tenantId, { status: "running", progress: 1, total: 3 });
        await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", audioPath]);
        const audioBuffer = await readFile(audioPath);
        await updateMediaJob(jobId, tenantId, { status: "running", progress: 2, total: 3 });

        const { text, words } = await transcribeAudioWithWordTimestamps(tenantId, "audio_transcription", audioBuffer, {
          mimeType: "audio/wav",
          language: "pt",
          log: req.log,
        });
        if (!words.length) {
          await updateMediaJob(jobId, tenantId, {
            status: "error",
            error: "Não foi possível identificar fala no vídeo — confirme se o áudio está audível.",
          });
          return;
        }

        const chunks = buildCaptionChunks(words);
        await updateMediaJob(jobId, tenantId, {
          status: "done",
          progress: 3,
          total: 3,
          transcript: { text, words, chunks, language: "pt", captionPreset },
        });
      } catch (err) {
        await updateMediaJob(jobId, tenantId, {
          status: "error",
          error: err instanceof Error ? err.message : "Erro na transcrição do vídeo",
        }).catch(() => undefined);
      } finally {
        await unlink(inPath).catch(() => {});
        await unlink(audioPath).catch(() => {});
      }
    })();
  },
);

router.post(
  "/tenants/:tenantId/content-studio/video/caption",
  upload.single("video"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    const tenantId = routeTenantId(req);
    const userId = req.user?.sub ?? null;
    const captionPreset = await resolveBrandCaptionPreset(tenantId);
    const jobId = randomUUID();
    const projectId = await createProcessingMediaProject({
      tenantId,
      userId,
      title: `Vídeo legendado — ${req.file.originalname}`,
      operation: "video_caption",
      context: {
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        captionPreset,
      },
    });
    await createMediaJob({
      id: jobId,
      tenantId,
      projectId,
      operation: "video_caption",
      input: { captionPreset },
    });
    res.json({ jobId, projectId, captionPreset });

    void (async () => {
      const tmpDir    = tmpdir();
      const inPath    = join(tmpDir, `cap-in-${jobId}.mp4`);
      const audioPath = join(tmpDir, `cap-audio-${jobId}.wav`);
      const assPath   = join(tmpDir, `cap-${jobId}.ass`);
      const outPath   = join(tmpDir, `cap-out-${jobId}.mp4`);
      try {
        await writeFile(inPath, req.file!.buffer);

        await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", audioPath]);
        const audioBuffer = await readFile(audioPath);

        const { words } = await transcribeAudioWithWordTimestamps(tenantId, "audio_transcription", audioBuffer, {
          mimeType: "audio/wav",
          language: "pt",
        });
        if (words.length === 0) {
          await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
          await updateMediaJob(jobId, tenantId, {
            status: "error",
            error: "Não foi possível identificar fala no vídeo — confirme se o áudio está audível.",
          });
          return;
        }

        const chunks = buildCaptionChunks(words);
        await writeFile(assPath, buildAssSubtitle(chunks, captionPreset), "utf8");

        const assFilterPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\\\:");
        await execFileAsync("ffmpeg", [
          "-y", "-i", inPath,
          "-vf", `ass=${assFilterPath}`,
          "-c:v", "libx264", "-c:a", "copy", "-preset", "fast",
          outPath,
        ]);

        const buf = await readFile(outPath);
        const objPath = await saveToBucket(buf, "video/mp4", `captioned-${jobId}.mp4`);
        await registerGeneratedMediaOutput({
          tenantId,
          projectId,
          userId,
          storageUrl: objPath,
          mimeType: "video/mp4",
          originalFilename: `captioned-${req.file!.originalname}`,
          operation: "video_caption",
          label: "Vídeo legendado",
          metadata: { jobId, captionChunks: chunks.length, language: "pt", captionPreset },
        }).catch(async (libraryError) => {
          req.log.error({ err: libraryError, tenantId, projectId, jobId }, "media-library: failed to register captioned video");
          await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        });
        await updateMediaJob(jobId, tenantId, { status: "done", videoUrl: objPath });
      } catch (err) {
        await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        await updateMediaJob(jobId, tenantId, {
          status: "error",
          error: err instanceof Error ? err.message : "Erro no processamento",
        }).catch(() => undefined);
      } finally {
        await unlink(inPath).catch(() => {});
        await unlink(audioPath).catch(() => {});
        await unlink(assPath).catch(() => {});
        await unlink(outPath).catch(() => {});
      }
    })();
  }
);


// ── Robustez do editor: análise musical + telemetria ─────────────────────────

router.post(
  "/tenants/:tenantId/content-studio/video/analyze-audio",
  upload.single("audio"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de áudio obrigatório" }); return; }

    const tenantId = routeTenantId(req);
    const requestId = randomUUID();
    const inputPath = join(tmpdir(), `beat-input-${requestId}`);
    const pcmPath = join(tmpdir(), `beat-pcm-${requestId}.s16le`);
    const parsedHint = Number((req.body as Record<string, string | undefined>)["bpmHint"] ?? "");
    const bpmHint = Number.isFinite(parsedHint) && parsedHint > 0 ? Math.max(60, Math.min(200, parsedHint)) : null;

    try {
      await writeFile(inputPath, req.file.buffer);
      await execFileAsync("ffmpeg", [
        "-y", "-v", "error", "-i", inputPath,
        "-t", "120", "-vn", "-ac", "1", "-ar", "16000",
        "-f", "s16le", pcmPath,
      ]);
      const pcm = await readFile(pcmPath);
      if (pcm.byteLength < 4) throw new Error("O áudio não possui amostras suficientes para análise");
      const samples = new Int16Array(Math.floor(pcm.byteLength / 2));
      for (let index = 0; index < samples.length; index += 1) samples[index] = pcm.readInt16LE(index * 2);
      const analysis = analyzePcm16Beats(samples, 16000, bpmHint);
      req.log.info({ tenantId, userId: req.user?.sub ?? null, bpm: analysis.bpm, confidence: analysis.confidence, source: "server" }, "video-editor: beat analysis fallback");
      res.json({ analysis: { ...analysis, source: "server" } });
    } catch (error) {
      req.log.warn({ err: error, tenantId, userId: req.user?.sub ?? null }, "video-editor: beat analysis fallback failed");
      res.status(422).json({ error: error instanceof Error ? error.message : "Falha na análise musical no servidor" });
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(pcmPath).catch(() => undefined);
    }
  },
);

router.post("/tenants/:tenantId/content-studio/video/editor-events", async (req, res) => {
  if (!authCheck(req, res)) return;
  const tenantId = routeTenantId(req);
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const event = String(body["event"] ?? "");
  if (!VIDEO_EDITOR_EVENTS.has(event)) { res.status(422).json({ error: "Evento do editor inválido" }); return; }
  const metadata = body["metadata"] && typeof body["metadata"] === "object" && !Array.isArray(body["metadata"])
    ? body["metadata"] as Record<string, unknown>
    : {};
  req.log.info({
    event,
    tenantId,
    userId: req.user?.sub ?? null,
    projectId: typeof body["projectId"] === "string" ? body["projectId"] : null,
    metadata,
  }, "video-editor:event");
  res.status(202).json({ accepted: true });
});

// ── Job status (shared) ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/content-studio/video/job/:jobId", async (req, res) => {
  if (!authCheck(req, res)) return;
  const tenantId = routeTenantId(req);
  const job = await getMediaJob(req.params["jobId"] ?? "", tenantId);
  if (!job) { res.status(404).json({ error: "Job não encontrado" }); return; }
  res.json(job);
});

export default router;