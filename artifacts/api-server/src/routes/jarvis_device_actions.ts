import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import { loadJarvisExternalCapabilities } from "../services/jarvis-external-capabilities.js";

const router: IRouter = Router();

type DeviceAction = {
  type: "open_external_url";
  provider: string;
  uri?: string;
  fallbackUrl: string;
  label?: string;
};

type ContactDeviceIntent = {
  kind: "call" | "whatsapp" | "route";
  contactQuery: string;
};

const VENDORAI_ROUTES: Array<{ keywords: RegExp; path: string; label: string }> = [
  { keywords: /\b(dashboard|painel)\b/, path: "/dashboard", label: "Dashboard" },
  { keywords: /\b(leads|clientes|contatos)\b/, path: "/leads", label: "Leads" },
  { keywords: /\b(conversas|mensagens|chat)\b/, path: "/conversations", label: "Conversas" },
  { keywords: /\b(agenda|calendario|calendar)\b/, path: "/agenda", label: "Agenda" },
  { keywords: /\b(marketing|conteudo|content)\b/, path: "/content", label: "Marketing e Conteúdo" },
  { keywords: /\b(prospector|prospeccao|prospectar)\b/, path: "/app/prospector", label: "Prospector" },
];

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

function cleanContactQuery(value: string) {
  return value
    .replace(/[,.!?]+$/g, "")
    .replace(/\s+(por favor|agora)$/i, "")
    .trim()
    .slice(0, 200);
}

function extractContactDeviceIntent(text: string): ContactDeviceIntent | null {
  const withoutJarvis = text.replace(/^\s*jarvis[, ]*/i, "").trim();
  const normalized = normalize(withoutJarvis);

  if (/^(ligue|liga|ligar|telefone|telefonar)\s+(para\s+|pro\s+|pra\s+)?/i.test(normalized)) {
    const query = cleanContactQuery(withoutJarvis.replace(/^(ligue|liga|ligar|telefone|telefonar)\s+(para\s+|pro\s+|pra\s+)?/i, ""));
    return query ? { kind: "call", contactQuery: query } : null;
  }

  if (/^(abra|abrir|mostre|mostrar)\s+(o\s+)?whatsapp\s+(do|da|de)\s+/i.test(normalized)) {
    const query = cleanContactQuery(withoutJarvis.replace(/^(abra|abrir|mostre|mostrar)\s+(o\s+)?whatsapp\s+(do|da|de)\s+/i, ""));
    return query ? { kind: "whatsapp", contactQuery: query } : null;
  }

  if (/^(abra|abrir|mostre|mostrar)\s+(a\s+)?conversa\s+(com\s+)?/i.test(normalized) && /\bwhatsapp\b/.test(normalized)) {
    const query = cleanContactQuery(withoutJarvis
      .replace(/^(abra|abrir|mostre|mostrar)\s+(a\s+)?conversa\s+(com\s+)?/i, "")
      .replace(/\s+(no|pelo)\s+whatsapp\s*$/i, ""));
    return query ? { kind: "whatsapp", contactQuery: query } : null;
  }

  if (/^(abra|abrir|mostre|mostrar|trace|tracar)\s+(a\s+)?(rota|mapa|caminho)\s+(para|ate)\s+/i.test(normalized)) {
    const query = cleanContactQuery(withoutJarvis.replace(/^(abra|abrir|mostre|mostrar|trace|traçar)\s+(a\s+)?(rota|mapa|caminho)\s+(para|até|ate)\s+/i, ""));
    return query ? { kind: "route", contactQuery: query } : null;
  }

  return null;
}

function extractVendorAiRoute(text: string): { path: string; label: string } | null {
  const normalized = normalize(text.replace(/^\s*jarvis[, ]*/i, ""));
  if (!/\b(abre|abra|abrir|va|ir|mostre|mostrar|acesse|acessar|leve)\b/.test(normalized)) return null;
  return VENDORAI_ROUTES.find((entry) => entry.keywords.test(normalized)) ?? null;
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

function normalizePhone(phone: string) {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return {
    digits,
    dial: raw.startsWith("+") ? `+${digits}` : digits,
  };
}

async function resolveTenantContact(tenantId: string, query: string) {
  const safe = query.replace(/[%_]/g, "").trim();
  const like = `%${safe}%`;
  return db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      telefone: leadsTable.telefone,
      email: leadsTable.email,
      endereco: leadsTable.endereco,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.telefone, like),
      ),
    ))
    .limit(5);
}

function contactAction(kind: ContactDeviceIntent["kind"], contact: { nome: string; telefone: string | null; endereco: string | null }): DeviceAction | null {
  if (kind === "call") {
    const phone = contact.telefone ? normalizePhone(contact.telefone) : null;
    if (!phone) return null;
    return {
      type: "open_external_url",
      provider: "telefone",
      uri: `tel:${phone.dial}`,
      fallbackUrl: `tel:${phone.dial}`,
      label: contact.nome,
    };
  }

  if (kind === "whatsapp") {
    const phone = contact.telefone ? normalizePhone(contact.telefone) : null;
    if (!phone) return null;
    return {
      type: "open_external_url",
      provider: "whatsapp",
      uri: `whatsapp://send?phone=${phone.digits}`,
      fallbackUrl: `https://wa.me/${phone.digits}`,
      label: contact.nome,
    };
  }

  if (!contact.endereco?.trim()) return null;
  const destination = encodeURIComponent(contact.endereco.trim());
  return {
    type: "open_external_url",
    provider: "maps",
    uri: `geo:0,0?q=${destination}`,
    fallbackUrl: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    label: contact.nome,
  };
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

  const spotifyQuery = extractSpotifyQuery(text);
  if (spotifyQuery) {
    const encoded = encodeURIComponent(spotifyQuery);
    writeSse(
      res,
      `Vou abrir “${spotifyQuery}” no Spotify deste dispositivo. Sem Spotify Connect conectado ao VendorAI, eu consigo abrir a busca, mas não vou afirmar que a música começou a tocar até ter confirmação real de reprodução.`,
      {
        clientAction: {
          type: "open_external_url",
          provider: "spotify",
          uri: `spotify:search:${encoded}`,
          fallbackUrl: `https://open.spotify.com/search/${encoded}`,
          label: spotifyQuery,
        },
        executionMode: "device_open",
        playbackConfirmed: false,
      },
    );
    return;
  }

  const vendorRoute = extractVendorAiRoute(text);
  if (vendorRoute) {
    const path = vendorRoute.path.replace(/^\//, "");
    writeSse(res, `Vou abrir ${vendorRoute.label} no VendorAI.`, {
      clientAction: {
        type: "open_external_url",
        provider: "vendorai",
        uri: `vendorai://${path}`,
        fallbackUrl: `https://app.appvendorai.com${vendorRoute.path}`,
        label: vendorRoute.label,
      },
      executionMode: "device_open",
    });
    return;
  }

  const contactIntent = extractContactDeviceIntent(text);
  if (!contactIntent) return next();

  const contacts = await resolveTenantContact(tenantId, contactIntent.contactQuery);
  if (!contacts.length) {
    writeSse(res, `Não encontrei “${contactIntent.contactQuery}” entre os contatos deste tenant.`);
    return;
  }
  if (contacts.length > 1) {
    const options = contacts.map((contact, index) => `${index + 1}. ${contact.nome}${contact.email ? ` — ${contact.email}` : ""}`).join("\n");
    writeSse(res, `Encontrei mais de um contato compatível com “${contactIntent.contactQuery}”. Qual deles?\n${options}`);
    return;
  }

  const contact = contacts[0]!;
  const action = contactAction(contactIntent.kind, contact);
  if (!action) {
    const missing = contactIntent.kind === "route" ? "endereço" : "telefone";
    writeSse(res, `${contact.nome} não possui ${missing} cadastrado neste tenant.`);
    return;
  }

  const verb = contactIntent.kind === "call"
    ? `abrir o discador para ${contact.nome}`
    : contactIntent.kind === "whatsapp"
      ? `abrir a conversa de ${contact.nome} no WhatsApp`
      : `abrir a rota para o endereço cadastrado de ${contact.nome}`;
  writeSse(res, `Vou ${verb}. Essa ação apenas abre o aplicativo correspondente; não vou afirmar que a ligação, mensagem ou deslocamento aconteceu sem confirmação posterior.`, {
    clientAction: action,
    executionMode: "device_open",
    actionConfirmed: false,
  });
});

export { extractSpotifyQuery, extractContactDeviceIntent, extractVendorAiRoute };
export default router;
