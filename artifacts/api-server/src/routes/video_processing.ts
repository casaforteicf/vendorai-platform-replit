import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { objectStorageClient } from "../lib/objectStorage.js";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const HEYGEN_BASE    = "https://api.heygen.com";
const HEYGEN_API_KEY = process.env["HEYGEN_API_KEY"];
const PRIVATE_DIR    = process.env["PRIVATE_OBJECT_DIR"] ?? "";

function heygenHeaders(extra: Record<string, string> = {}) {
  return { "X-Api-Key": HEYGEN_API_KEY ?? "", ...extra };
}

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

// ── In-memory job store ────────────────────────────────────────────────────────

interface VideoJob {
  status: "running" | "done" | "error";
  progress?: number;
  total?: number;
  videoUrl?: string;
  clips?: string[];
  results?: { name: string; status: "pending" | "generating" | "done" | "error"; videoUrl?: string; error?: string }[];
  error?: string;
}
const JOBS = new Map<string, VideoJob>();

// ── Edição automática ─────────────────────────────────────────────────────────

router.post(
  "/tenants/:tenantId/content-studio/video/edit",
  upload.single("video"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    const { removeSilence = "true", speed = "1.0", normalize = "false" } = req.body as Record<string, string>;
    const jobId = randomUUID();
    JOBS.set(jobId, { status: "running" });
    res.json({ jobId });

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
        JOBS.set(jobId, { status: "done", videoUrl: `/api/storage${objPath}` });
      } catch (err) {
        JOBS.set(jobId, { status: "error", error: err instanceof Error ? err.message : "Erro no processamento" });
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

    const { clipDuration = "60", maxClips = "4", convertTo9x16 = "false" } = req.body as Record<string, string>;
    const jobId = randomUUID();
    JOBS.set(jobId, { status: "running", progress: 0, total: 0 });
    res.json({ jobId });

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

        JOBS.set(jobId, { status: "running", progress: 0, total: nClips });

        const clipUrls: string[] = [];

        for (let i = 0; i < nClips; i++) {
          const start   = i * clipSec;
          const outPath = join(tmpDir, `vc-clip-${jobId}-${i}.mp4`);
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

          JOBS.set(jobId, { status: "running", progress: i + 1, total: nClips });
        }

        JOBS.set(jobId, { status: "done", clips: clipUrls, progress: nClips, total: nClips });
      } catch (err) {
        JOBS.set(jobId, { status: "error", error: err instanceof Error ? err.message : "Erro no processamento" });
      } finally {
        await unlink(inPath).catch(() => {});
        for (const p of clipPaths) await unlink(p).catch(() => {});
      }
    })();
  }
);

// ── Vídeo em lote ─────────────────────────────────────────────────────────────

interface BatchItem { name: string; topic: string; script?: string }

router.post("/tenants/:tenantId/content-studio/video/batch", async (req, res) => {
  if (!authCheck(req, res)) return;
  if (!HEYGEN_API_KEY) { res.status(503).json({ error: "HEYGEN_API_KEY não configurada" }); return; }

  const { items, avatarId, voiceId = "pt-BR-FranciscaNeural", quality = "720p", autoScript = true } = req.body as {
    items?: BatchItem[]; avatarId?: string; voiceId?: string; quality?: string; autoScript?: boolean;
  };

  if (!items?.length || !avatarId) {
    res.status(422).json({ error: "items e avatarId são obrigatórios" }); return;
  }
  if (items.length > 20) { res.status(422).json({ error: "Máx. 20 vídeos por lote" }); return; }

  const jobId = randomUUID();
  const results: VideoJob["results"] = items.map((it) => ({ name: it.name, status: "pending" }));
  JOBS.set(jobId, { status: "running", progress: 0, total: items.length, results });
  res.json({ jobId });

  const dimension = quality === "1080p" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };

  void (async () => {
    let done = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      results[i]!.status = "generating";
      JOBS.set(jobId, { status: "running", progress: done, total: items.length, results: [...results] });

      try {
        let script = item.script?.trim() || "";

        if (autoScript && !script) {
          const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 300,
            messages: [{
              role: "user",
              content: `Escreva um script de vídeo de 30 segundos personalizado para ${item.name} sobre o tópico: "${item.topic}". Tom: profissional e direto. Máx. 200 palavras.`,
            }],
          });
          script = (msg.content[0] as { type: string; text?: string }).text ?? item.topic;
        }

        if (!script) script = item.topic;

        // Generate video via HeyGen
        const vidRes = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
          method: "POST",
          headers: heygenHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            video_inputs: [{
              character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
              voice: { type: "text", input_text: script.substring(0, 1500), voice_id: voiceId },
            }],
            dimension,
          }),
        });
        const vidData = await vidRes.json() as { data?: { video_id?: string }; error?: string };
        if (!vidRes.ok || !vidData.data?.video_id) throw new Error(vidData.error ?? "Falha ao gerar vídeo");

        // Poll until done (max 10 min per video)
        const videoId = vidData.data.video_id;
        let videoUrl = "";
        for (let poll = 0; poll < 120; poll++) {
          await new Promise((r) => setTimeout(r, 5000));
          const stRes  = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, { headers: heygenHeaders() });
          const stData = await stRes.json() as { data?: { status?: string; video_url?: string; error?: string }; error?: string };
          if (stData.data?.status === "completed") { videoUrl = stData.data.video_url ?? ""; break; }
          if (stData.data?.status === "failed") throw new Error(stData.data.error ?? "Geração falhou");
        }

        results[i]!.status  = "done";
        results[i]!.videoUrl = videoUrl;
      } catch (err) {
        results[i]!.status = "error";
        results[i]!.error  = err instanceof Error ? err.message : "Erro";
      }

      done++;
      JOBS.set(jobId, { status: "running", progress: done, total: items.length, results: [...results] });
    }

    const anyError = results.some((r) => r.status === "error");
    JOBS.set(jobId, { status: anyError ? "error" : "done", progress: done, total: items.length, results });
  })();
});

// ── Job status (shared) ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/content-studio/video/job/:jobId", async (req, res) => {
  if (!authCheck(req, res)) return;
  const job = JOBS.get(req.params["jobId"] ?? "");
  if (!job) { res.status(404).json({ error: "Job não encontrado" }); return; }
  res.json(job);
});

export default router;
