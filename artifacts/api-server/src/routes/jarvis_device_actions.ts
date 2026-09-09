import { Router, type IRouter } from "express";
import { loadJarvisExternalCapabilities } from "../services/jarvis-external-capabilities.js";

const router: IRouter = Router();

function lastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const messages = Reflect.get(body, "messages");
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object" || Reflect.get(message, "role") !== "user") continue;
    const content = Reflect.get(message, "content");
    return typeof content === "string" ? content.trim() : null;
  }
  return null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractSpotifyQuery(text: string): string | null {
  const normalized = normalize(text);
  const wantsMusic = /\b(toca|toque|tocar|coloca|coloque|ouvir|abra|abrir)\b/.test(normalized)
    && /\b(musica|som|faixa|album|artista|spotify)\b/.test(normalized);
  if (!wantsMusic) return null;

  const cleaned = text
    .replace(/^\s*(jarvis[, ]*)?/i, "")
    .replace(/^\s*(toca|toque|tocar|coloca|coloque|ouvir|abra|abrir)\s+/i, "")
    .replace(/^\s*(a|o|uma|um)?\s*(m[uú]sica|som|faixa|[aá]lbum|artista)?\s*/i, "")
    .replace(/\s+(no|na|pelo|pela)\s+spotify\s*$/i, "")
    .replace(/^\s*(no|na|pelo|pela)\s+spotify\s+/i, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return null;
  return cleaned.slice(0, 300);
}

function writeSse(res: any, content: string, extra: Record<string, unknown> = {}) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true, ...extra })}\n\n`);
  res.end();
}

router.get("/jarvis/capabilities", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const capabilities = await loadJarvisExternalCapabilities(tenantId);
  return res.json({ generatedAt: new Date().toISOString(), capabilities });
});

router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

  const query = extractSpotifyQuery(text);
  if (!query) return next();

  const encoded = encodeURIComponent(query);
  const spotifyUri = `spotify:search:${encoded}`;
  const fallbackUrl = `https://open.spotify.com/search/${encoded}`;

  writeSse(
    res,
    `Vou abrir “${query}” no Spotify deste dispositivo. Sem Spotify Connect conectado ao VendorAI, eu consigo abrir a busca, mas não vou afirmar que a música começou a tocar até ter confirmação real de reprodução.`,
    {
      clientAction: {
        type: "open_external_url",
        provider: "spotify",
        uri: spotifyUri,
        fallbackUrl,
        label: query,
      },
      executionMode: "device_open",
      playbackConfirmed: false,
    },
  );
});

export { extractSpotifyQuery };
export default router;
