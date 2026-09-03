import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { objectStorageClient } from "../lib/objectStorage.js";
import { transcribeAudioWithWordTimestamps, type TranscriptionWord } from "../lib/ai-gateway.js";
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

function authCheck(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  const tenantId = String(req.params["tenantId"]);
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

    const tenantId = String(req.params["tenantId"]);
    const userId = req.user?.sub ?? null;
    const { removeSilence = "true", speed = "1.0", normalize = "false" } = req.body as Record<string, string>;
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
      },
    });
    await createMediaJob({
      id: jobId,
      tenantId,
      projectId,
      operation: "video_edit",
      input: { removeSilence, speed, normalize },
    });
    res.json({ jobId, projectId });

    // ── async processing ─────────────────────────────────────────────────────
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
        if (normalize === "true") aFilters.push("loudnorm");

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
          metadata: { jobId, removeSilence, speed, normalize },
        }).catch(async (libraryError) => {
          req.log.error({ err: libraryError, tenantId, projectId, jobId }, "media-library: failed to register edited video");
          await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        });
        await updateMediaJob(jobId, tenantId, { status: "done", videoUrl: `/api/storage${objPath}` });
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

    const tenantId = String(req.params["tenantId"]);
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
        const clipSec  = Math.max(10, parseInt(clipDuration, 10) || 60);
        const nClips   = Math.min(
          parseInt(maxClips, 10) || 4,
          Math.floor(duration / clipSec)
        );

        await updateMediaJob(jobId, tenantId, { status: "running", progress: 0, total: nClips });

        const clipUrls: string[] = [];

        for (let i = 0; i < nClips; i++) {
          const start   = i * clipSec;
          const outPath = join(tmpdir(), `vc-clip-${jobId}-${i}.mp4`);
          clipPaths.push(outPath);

          const ffmpegArgs: string[] = [
            "-y", "-i", inPath,
            "-ss", String(start), "-t", String(clipSec),
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
            metadata: { jobId, clipIndex: i, start, duration: clipSec, convertTo9x16 },
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
// legenda no vídeo via ffmpeg (filtro ass, estilo TikTok/Reels: texto
// branco em negrito, contorno preto, terço inferior). Agrupa palavras em
// blocos curtos (3-6 palavras ou corte em pausa >0.6s) em vez de
// legenda-frase-inteira, pra ficar no ritmo de leitura de Reels curto.

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

function buildCaptionChunks(words: TranscriptionWord[]): { start: number; end: number; text: string }[] {
  const chunks: { start: number; end: number; text: string }[] = [];
  let current: TranscriptionWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      text: current.map((w) => w.word).join(" ").trim(),
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

function buildAssSubtitle(chunks: { start: number; end: number; text: string }[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Liberation Sans,88,&H00FFFFFF,&H00000000,&H00000000,1,0,1,6,0,2,60,60,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = chunks
    .map((c) => `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${escapeAssText(c.text.toUpperCase())}`)
    .join("\n");
  return header + lines;
}

router.post(
  "/tenants/:tenantId/content-studio/video/caption",
  upload.single("video"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    const tenantId = String(req.params["tenantId"]);
    const userId = req.user?.sub ?? null;
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
      },
    });
    await createMediaJob({ id: jobId, tenantId, projectId, operation: "video_caption" });
    res.json({ jobId, projectId });

    void (async () => {
      const tmpDir    = tmpdir();
      const inPath    = join(tmpDir, `cap-in-${jobId}.mp4`);
      const audioPath = join(tmpDir, `cap-audio-${jobId}.wav`);
      const assPath   = join(tmpDir, `cap-${jobId}.ass`);
      const outPath   = join(tmpDir, `cap-out-${jobId}.mp4`);
      try {
        await writeFile(inPath, req.file!.buffer);

        // 1) Extrai áudio em WAV mono 16kHz — formato mais leve/confiável pro Whisper.
        await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", audioPath]);
        const audioBuffer = await readFile(audioPath);

        // 2) Transcreve com timestamp por palavra.
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

        // 3) Monta legenda estilo Reels (blocos curtos) e grava o .ass.
        const chunks = buildCaptionChunks(words);
        await writeFile(assPath, buildAssSubtitle(chunks), "utf8");

        // 4) Queima a legenda no vídeo. Caminho absoluto do .ass precisa
        // ser escapado pro filtro ass= do ffmpeg (Windows-style escaping
        // exigido pelo próprio libass mesmo em Linux, por herança do formato).
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
          metadata: { jobId, captionChunks: chunks.length, language: "pt" },
        }).catch(async (libraryError) => {
          req.log.error({ err: libraryError, tenantId, projectId, jobId }, "media-library: failed to register captioned video");
          await setMediaProjectStatus(tenantId, projectId, "draft").catch(() => undefined);
        });
        await updateMediaJob(jobId, tenantId, { status: "done", videoUrl: `/api/storage${objPath}` });
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

// ── Job status (shared) ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/content-studio/video/job/:jobId", async (req, res) => {
  if (!authCheck(req, res)) return;
  const tenantId = String(req.params["tenantId"]);
  const job = await getMediaJob(req.params["jobId"] ?? "", tenantId);
  if (!job) { res.status(404).json({ error: "Job não encontrado" }); return; }
  res.json(job);
});

export default router;
