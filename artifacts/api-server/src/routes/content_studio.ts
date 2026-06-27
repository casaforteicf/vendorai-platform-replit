import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const HEYGEN_API_KEY = process.env["HEYGEN_API_KEY"];
const HEYGEN_UPLOAD = "https://upload.heygen.com/v1/asset";
const HEYGEN_BASE   = "https://api.heygen.com";

function heygenHeaders(extra: Record<string, string> = {}) {
  return { "X-Api-Key": HEYGEN_API_KEY ?? "", ...extra };
}

// ─── Script generation (Anthropic) ────────────────────────────────────────────

const TABS = ["workflow", "trends", "hooks", "script"] as const;
type Tab = (typeof TABS)[number];

function buildPrompt(tab: Tab, input: string): string {
  const prompts: Record<Tab, string> = {
    workflow: `Crie um fluxo de conteúdo para Instagram no nicho "${input}": 5 tópicos em alta, script, visual, legenda e 10 hashtags.`,
    trends:   `Liste 5 ângulos de conteúdo em alta no nicho "${input}" para Reels e vídeos curtos com IA.`,
    hooks:    `Crie 5 ganchos para parar a rolagem no nicho "${input}" nos primeiros 3 segundos. Use os gatilhos: surpresa, medo, ego, urgência e desejo.`,
    script:   `Escreva um script de Reel sobre "${input}" com: GANCHO (0-2s), DESENVOLVIMENTO (3-25s) e CTA (26-30s). Máximo 30 segundos.`,
  };
  return prompts[tab];
}

router.post("/tenants/:tenantId/content-studio/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const { tab, input } = req.body as { tab?: string; input?: string };
  if (!input || typeof input !== "string" || input.trim().length < 2) {
    res.status(422).json({ error: "Campo 'input' é obrigatório (mín. 2 caracteres)" }); return;
  }

  const resolvedTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "script";
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português.",
      messages: [{ role: "user", content: buildPrompt(resolvedTab, input.trim()) }],
    });
    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    res.json({ result, tab: resolvedTab });
  } catch (err) {
    req.log.error({ err }, "content-studio: generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

// ─── HeyGen helpers ───────────────────────────────────────────────────────────

function requireHeygenKey(res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  if (!HEYGEN_API_KEY) {
    res.status(503).json({ error: "HEYGEN_API_KEY não configurada. Adicione em Secrets e reinicie o servidor." });
    return false;
  }
  return true;
}

// ─── STEP 1: Upload vídeo → retorna asset_url ─────────────────────────────────
router.post(
  "/tenants/:tenantId/content-studio/heygen/upload-video",
  upload.single("video"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Acesso negado" }); return;
    }
    if (!requireHeygenKey(res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }

    try {
      const response = await fetch(HEYGEN_UPLOAD, {
        method: "POST",
        headers: heygenHeaders({ "Content-Type": req.file.mimetype }),
        body: req.file.buffer,
      });
      const data = await response.json() as { data?: { url?: string }; error?: string };
      if (!response.ok || !data.data?.url) {
        req.log.error({ data }, "heygen: upload-video failed");
        res.status(502).json({ error: data.error ?? "Falha no upload para HeyGen" }); return;
      }
      res.json({ assetUrl: data.data.url });
    } catch (err) {
      req.log.error({ err }, "heygen: upload-video error");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro no upload" });
    }
  }
);

// ─── STEP 2: Criar avatar com o vídeo enviado ─────────────────────────────────
router.post("/tenants/:tenantId/content-studio/heygen/create-avatar", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  if (!requireHeygenKey(res)) return;

  const { assetUrl, name = "Avatar VendorAI" } = req.body as { assetUrl?: string; name?: string };
  if (!assetUrl) { res.status(422).json({ error: "assetUrl é obrigatório" }); return; }

  try {
    const response = await fetch(`${HEYGEN_BASE}/v2/video_avatar`, {
      method: "POST",
      headers: heygenHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ video_url: assetUrl, name }),
    });
    const data = await response.json() as { data?: { video_avatar_id?: string }; error?: string };
    if (!response.ok || !data.data?.video_avatar_id) {
      req.log.error({ data }, "heygen: create-avatar failed");
      res.status(502).json({ error: data.error ?? "Falha ao criar avatar" }); return;
    }
    res.json({ avatarId: data.data.video_avatar_id });
  } catch (err) {
    req.log.error({ err }, "heygen: create-avatar error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao criar avatar" });
  }
});

// ─── STEP 3: Status do avatar (poll até "completed") ──────────────────────────
router.get("/tenants/:tenantId/content-studio/heygen/avatar-status/:avatarId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  if (!requireHeygenKey(res)) return;

  const { avatarId } = req.params;
  try {
    const response = await fetch(`${HEYGEN_BASE}/v2/video_avatar/${avatarId}`, {
      headers: heygenHeaders(),
    });
    const data = await response.json() as { data?: { status?: string; video_avatar_id?: string }; error?: string };
    if (!response.ok) {
      res.status(502).json({ error: data.error ?? "Falha ao consultar status do avatar" }); return;
    }
    res.json({ status: data.data?.status ?? "unknown", avatarId: data.data?.video_avatar_id });
  } catch (err) {
    req.log.error({ err }, "heygen: avatar-status error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao consultar avatar" });
  }
});

// ─── STEP 4: Gerar vídeo com o avatar ────────────────────────────────────────
router.post("/tenants/:tenantId/content-studio/heygen/generate-video", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  if (!requireHeygenKey(res)) return;

  const { avatarId, script, voiceId = "en-US-JennyNeural" } = req.body as {
    avatarId?: string; script?: string; voiceId?: string;
  };
  if (!avatarId || !script) {
    res.status(422).json({ error: "avatarId e script são obrigatórios" }); return;
  }

  try {
    const response = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: "POST",
      headers: heygenHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        video_inputs: [{
          character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
          voice: { type: "text", input_text: script.substring(0, 1500), voice_id: voiceId },
        }],
        dimension: { width: 1280, height: 720 },
      }),
    });
    const data = await response.json() as { data?: { video_id?: string }; error?: string };
    if (!response.ok || !data.data?.video_id) {
      req.log.error({ data }, "heygen: generate-video failed");
      res.status(502).json({ error: data.error ?? "Falha ao iniciar geração" }); return;
    }
    res.json({ videoId: data.data.video_id });
  } catch (err) {
    req.log.error({ err }, "heygen: generate-video error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar vídeo" });
  }
});

// ─── STEP 5: Status do vídeo (poll) ──────────────────────────────────────────
router.get("/tenants/:tenantId/content-studio/heygen/video-status/:videoId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  if (!requireHeygenKey(res)) return;

  const { videoId } = req.params;
  try {
    const response = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
      headers: heygenHeaders(),
    });
    const data = await response.json() as {
      data?: { status?: string; video_url?: string; error?: string };
      error?: string;
    };
    if (!response.ok) {
      res.status(502).json({ error: data.error ?? "Falha ao consultar status" }); return;
    }
    res.json({
      status:   data.data?.status ?? "unknown",
      videoUrl: data.data?.video_url,
      error:    data.data?.error,
    });
  } catch (err) {
    req.log.error({ err }, "heygen: video-status error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao consultar vídeo" });
  }
});

export default router;
