import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { campaignsTable, db, jarvisCasesTable, leadsTable, propostasTable } from "@workspace/db";
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

type ContextNavigationIntent =
  | { kind: "lead"; query: string }
  | { kind: "proposal"; query: string }
  | { kind: "campaign"; query: string }
  | { kind: "case"; query: string };

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

function stripJarvis(text: string) {
  return text.replace(/^\s*jarvis[, ]*/i, "").trim();
}

function cleanQuery(value: string) {
  return value.replace(/[,.!?]+$/g, "").replace(/\s+(por favor|agora)$/i, "").trim().slice(0, 200);
}

function extractLeadFilterQuery(text: string): string | null {
  const value = stripJarvis(text);
  const match = value.match(/^(filtre|filtrar|liste|listar|mostre|mostrar)\s+(os\s+)?leads\s+(de|da|do|em|com)\s+(.+)$/i);
  return match?.[4] ? cleanQuery(match[4]) : null;
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
  return cleaned.length >= 2 ? cleaned.slice(0, 300) : null;
}

function extractContextNavigationIntent(text: string): ContextNavigationIntent | null {
  const value = stripJarvis(text);
  const patterns = [
    { kind: "lead" as const, regex: /^(abra|abrir|mostre|mostrar|acesse|acessar)\s+(o\s+|a\s+)?(cliente|lead|contato)\s+/i },
    { kind: "proposal" as const, regex: /^(abra|abrir|mostre|mostrar|acesse|acessar)\s+(a\s+)?proposta\s+/i },
    { kind: "campaign" as const, regex: /^(abra|abrir|mostre|mostrar|acesse|acessar)\s+(a\s+)?campanha\s+/i },
    { kind: "case" as const, regex: /^(abra|abrir|mostre|mostrar|acesse|acessar)\s+(o\s+)?(caso\s+vendor|caso)\s+/i },
  ];
  for (const pattern of patterns) {
    if (!pattern.regex.test(value)) continue;
    const query = cleanQuery(value.replace(pattern.regex, ""));
    return query ? { kind: pattern.kind, query } : null;
  }
  return null;
}

function extractContactDeviceIntent(text: string): ContactDeviceIntent | null {
  const value = stripJarvis(text);
  const normalized = normalize(value);
  if (/^(ligue|liga|ligar|telefone|telefonar)\s+(para\s+|pro\s+|pra\s+)?/i.test(normalized)) {
    const query = cleanQuery(value.replace(/^(ligue|liga|ligar|telefone|telefonar)\s+(para\s+|pro\s+|pra\s+)?/i, ""));
    return query ? { kind: "call", contactQuery: query } : null;
  }
  if (/^(abra|abrir|mostre|mostrar)\s+(o\s+)?whatsapp\s+(do|da|de)\s+/i.test(normalized)) {
    const query = cleanQuery(value.replace(/^(abra|abrir|mostre|mostrar)\s+(o\s+)?whatsapp\s+(do|da|de)\s+/i, ""));
    return query ? { kind: "whatsapp", contactQuery: query } : null;
  }
  if (/^(abra|abrir|mostre|mostrar)\s+(a\s+)?conversa\s+(com\s+)?/i.test(normalized) && /\bwhatsapp\b/.test(normalized)) {
    const query = cleanQuery(value.replace(/^(abra|abrir|mostre|mostrar)\s+(a\s+)?conversa\s+(com\s+)?/i, "").replace(/\s+(no|pelo)\s+whatsapp\s*$/i, ""));
    return query ? { kind: "whatsapp", contactQuery: query } : null;
  }
  if (/^(abra|abrir|mostre|mostrar|trace|tracar)\s+(a\s+)?(rota|mapa|caminho)\s+(para|ate)\s+/i.test(normalized)) {
    const query = cleanQuery(value.replace(/^(abra|abrir|mostre|mostrar|trace|traçar)\s+(a\s+)?(rota|mapa|caminho)\s+(para|até|ate)\s+/i, ""));
    return query ? { kind: "route", contactQuery: query } : null;
  }
  return null;
}

function extractVendorAiRoute(text: string): { path: string; label: string } | null {
  const normalized = normalize(stripJarvis(text));
  if (!/\b(abre|abra|abrir|va|ir|mostre|mostrar|acesse|acessar|leve)\b/.test(normalized)) return null;
  const entry = VENDORAI_ROUTES.find((route) => route.keywords.test(normalized));
  return entry ? { path: entry.path, label: entry.label } : null;
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

function vendorAction(path: string, label: string, nativePath?: string): DeviceAction {
  return {
    type: "open_external_url",
    provider: "vendorai",
    ...(nativePath ? { uri: `vendorai://${nativePath.replace(/^\//, "")}` } : {}),
    fallbackUrl: `https://app.appvendorai.com${path}`,
    label,
  };
}

function normalizePhone(phone: string) {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return { digits, dial: raw.startsWith("+") ? `+${digits}` : digits };
}

async function resolveTenantContact(tenantId: string, query: string) {
  const safe = query.replace(/[%_]/g, "").trim();
  const like = `%${safe}%`;
  return db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone, email: leadsTable.email, endereco: leadsTable.endereco })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), or(ilike(leadsTable.nome, like), ilike(leadsTable.email, like), ilike(leadsTable.telefone, like))))
    .limit(5);
}

async function filterTenantLeads(tenantId: string, query: string) {
  const safe = query.replace(/[%_]/g, "").trim();
  const like = `%${safe}%`;
  return db.select({
    id: leadsTable.id,
    nome: leadsTable.nome,
    empresa: leadsTable.empresa,
    telefone: leadsTable.telefone,
    email: leadsTable.email,
    endereco: leadsTable.endereco,
    status: leadsTable.status,
  })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.empresa, like),
        ilike(leadsTable.telefone, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.endereco, like),
      ),
    ))
    .limit(20);
}

function resolveRows<T>(rows: T[], query: string, labelOf: (row: T) => string, actionOf: (row: T) => DeviceAction) {
  if (!rows.length) return { error: `Não encontrei “${query}” neste tenant.` };
  if (rows.length > 1) return { error: `Encontrei mais de um resultado para “${query}”. Qual deles?\n${rows.map((row, index) => `${index + 1}. ${labelOf(row)}`).join("\n")}` };
  const row = rows[0]!;
  return { label: labelOf(row), action: actionOf(row) };
}

async function resolveContextNavigation(tenantId: string, intent: ContextNavigationIntent) {
  const safe = intent.query.replace(/[%_]/g, "").trim();
  const like = `%${safe}%`;
  if (intent.kind === "lead") {
    const rows = await db.select({ id: leadsTable.id, nome: leadsTable.nome, email: leadsTable.email })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), or(ilike(leadsTable.nome, like), ilike(leadsTable.email, like))))
      .limit(5);
    return resolveRows(rows, safe, (row) => row.nome, (row) => vendorAction(`/leads/${row.id}`, row.nome, `/leads/${row.id}`));
  }
  if (intent.kind === "proposal") {
    const rows = await db.select({ id: propostasTable.id, titulo: propostasTable.titulo, leadNome: leadsTable.nome })
      .from(propostasTable)
      .leftJoin(leadsTable, and(eq(propostasTable.leadId, leadsTable.id), eq(leadsTable.tenantId, tenantId)))
      .where(and(eq(propostasTable.tenantId, tenantId), or(ilike(propostasTable.titulo, like), ilike(leadsTable.nome, like))))
      .limit(5);
    return resolveRows(rows, safe, (row) => row.titulo || row.leadNome || "Proposta", (row) => vendorAction(`/propostas/${row.id}`, row.titulo || "Proposta"));
  }
  if (intent.kind === "campaign") {
    const rows = await db.select({ id: campaignsTable.id, nome: campaignsTable.nome })
      .from(campaignsTable)
      .where(and(eq(campaignsTable.tenantId, tenantId), ilike(campaignsTable.nome, like)))
      .limit(5);
    return resolveRows(rows, safe, (row) => row.nome, (row) => vendorAction(`/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(row.id)}`, row.nome));
  }
  const rows = await db.select({ id: jarvisCasesTable.id, title: jarvisCasesTable.title })
    .from(jarvisCasesTable)
    .where(and(eq(jarvisCasesTable.tenantId, tenantId), or(eq(jarvisCasesTable.id, safe), ilike(jarvisCasesTable.title, like))))
    .limit(5);
  return resolveRows(rows, safe, (row) => row.title, (row) => vendorAction(`/app/prospector?tab=busca&jarvisCase=${encodeURIComponent(row.id)}`, row.title));
}

function contactAction(kind: ContactDeviceIntent["kind"], contact: { nome: string; telefone: string | null; endereco: string | null }): DeviceAction | null {
  if (kind === "call") {
    const phone = contact.telefone ? normalizePhone(contact.telefone) : null;
    if (!phone) return null;
    return { type: "open_external_url", provider: "telefone", uri: `tel:${phone.dial}`, fallbackUrl: `tel:${phone.dial}`, label: contact.nome };
  }
  if (kind === "whatsapp") {
    const phone = contact.telefone ? normalizePhone(contact.telefone) : null;
    if (!phone) return null;
    return { type: "open_external_url", provider: "whatsapp", uri: `whatsapp://send?phone=${phone.digits}`, fallbackUrl: `https://wa.me/${phone.digits}`, label: contact.nome };
  }
  if (!contact.endereco?.trim()) return null;
  const destination = encodeURIComponent(contact.endereco.trim());
  return { type: "open_external_url", provider: "maps", uri: `geo:0,0?q=${destination}`, fallbackUrl: `https://www.google.com/maps/dir/?api=1&destination=${destination}`, label: contact.nome };
}

router.get("/jarvis/capabilities", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  return res.json({ generatedAt: new Date().toISOString(), capabilities: await loadJarvisExternalCapabilities(tenantId) });
});

router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

  const spotifyQuery = extractSpotifyQuery(text);
  if (spotifyQuery) {
    const encoded = encodeURIComponent(spotifyQuery);
    writeSse(res, `Vou abrir “${spotifyQuery}” no Spotify deste dispositivo. Sem Spotify Connect conectado ao VendorAI, eu consigo abrir a busca, mas não vou afirmar que a música começou a tocar até ter confirmação real de reprodução.`, {
      clientAction: { type: "open_external_url", provider: "spotify", uri: `spotify:search:${encoded}`, fallbackUrl: `https://open.spotify.com/search/${encoded}`, label: spotifyQuery },
      executionMode: "device_open",
      playbackConfirmed: false,
    });
    return;
  }

  const leadFilter = extractLeadFilterQuery(text);
  if (leadFilter) {
    const rows = await filterTenantLeads(tenantId, leadFilter);
    if (!rows.length) {
      writeSse(res, `Não encontrei leads compatíveis com “${leadFilter}” neste tenant.`);
      return;
    }
    const visible = rows.slice(0, 10);
    const lines = visible.map((lead, index) => {
      const details = [lead.empresa, lead.endereco, lead.status].filter(Boolean).join(" · ");
      return `${index + 1}. ${lead.nome}${details ? ` — ${details}` : ""}`;
    });
    const remainder = rows.length > visible.length ? `\n… e mais ${rows.length - visible.length} resultado(s) nesta consulta.` : "";
    const encodedFilter = encodeURIComponent(leadFilter);
    writeSse(res, `Encontrei ${rows.length} lead(s) para “${leadFilter}”:\n${lines.join("\n")}${remainder}\n\nVou abrir a tela de Leads com o mesmo filtro aplicado. A consulta foi feita somente nos dados deste tenant.`, {
      filteredLeadIds: rows.map((lead) => lead.id),
      filterQuery: leadFilter,
      filterApplied: "server_and_client",
      clientAction: vendorAction(`/leads?search=${encodedFilter}`, `Leads: ${leadFilter}`, `/leads?search=${encodedFilter}`),
      executionMode: "device_open",
    });
    return;
  }

  const contextualIntent = extractContextNavigationIntent(text);
  if (contextualIntent) {
    const resolved = await resolveContextNavigation(tenantId, contextualIntent);
    if ("error" in resolved) {
      writeSse(res, resolved.error);
      return;
    }
    writeSse(res, `Vou abrir ${resolved.label} no VendorAI.`, { clientAction: resolved.action, executionMode: "device_open", entityResolved: true });
    return;
  }

  const vendorRoute = extractVendorAiRoute(text);
  if (vendorRoute) {
    const path = vendorRoute.path.replace(/^\//, "");
    writeSse(res, `Vou abrir ${vendorRoute.label} no VendorAI.`, {
      clientAction: { type: "open_external_url", provider: "vendorai", uri: `vendorai://${path}`, fallbackUrl: `https://app.appvendorai.com${vendorRoute.path}`, label: vendorRoute.label },
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
    writeSse(res, `Encontrei mais de um contato compatível com “${contactIntent.contactQuery}”. Qual deles?\n${contacts.map((contact, index) => `${index + 1}. ${contact.nome}${contact.email ? ` — ${contact.email}` : ""}`).join("\n")}`);
    return;
  }
  const contact = contacts[0]!;
  const action = contactAction(contactIntent.kind, contact);
  if (!action) {
    writeSse(res, `${contact.nome} não possui ${contactIntent.kind === "route" ? "endereço" : "telefone"} cadastrado neste tenant.`);
    return;
  }
  const verb = contactIntent.kind === "call" ? `abrir o discador para ${contact.nome}` : contactIntent.kind === "whatsapp" ? `abrir a conversa de ${contact.nome} no WhatsApp` : `abrir a rota para o endereço cadastrado de ${contact.nome}`;
  writeSse(res, `Vou ${verb}. Essa ação apenas abre o aplicativo correspondente; não vou afirmar que a ligação, mensagem ou deslocamento aconteceu sem confirmação posterior.`, { clientAction: action, executionMode: "device_open", actionConfirmed: false });
});

export { extractSpotifyQuery, extractContactDeviceIntent, extractContextNavigationIntent, extractLeadFilterQuery, extractVendorAiRoute };
export default router;