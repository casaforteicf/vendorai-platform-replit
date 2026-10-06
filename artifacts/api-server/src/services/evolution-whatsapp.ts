// WhatsApp via QR Code — integração com a Evolution API self-hosted
// (Railway, serviço "evolution-api"), ao lado do Z-API e da API oficial
// da Meta como 3ª via de conexão. Diferente do Z-API (serviço de
// terceiros com credencial própria por instância), aqui NÓS somos o
// dono da API — todas as chamadas usam a mesma chave global do
// servidor (EVOLUTION_API_KEY), e cada tenant só precisa de um nome de
// instância determinístico.
import type { Logger } from "pino";
import { db, agentConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const EVOLUTION_API_URL = (process.env["EVOLUTION_API_URL"] ?? "").replace(/\/$/, "");
const EVOLUTION_API_KEY = process.env["EVOLUTION_API_KEY"] ?? "";

export class EvolutionApiError extends Error {}

function assertConfigured() {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    throw new EvolutionApiError("Evolution API não configurada no servidor (EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes).");
  }
}

function instanceNameFor(tenantId: string, connectionId?: string): string {
  return connectionId ? `vendorai-${tenantId}-${connectionId.slice(0, 8)}` : `vendorai-${tenantId}`;
}

async function evoFetch(path: string, init: RequestInit = {}): Promise<any> {
  assertConfigured();
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new EvolutionApiError(`Evolution API ${res.status} em ${path}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

function webhookUrlFor(tenantId: string, webhookSecret: string, connectionId?: string): string {
  // Mesmo domínio já usado nos outros webhooks de entrada (WhatsApp
  // Meta, N8N) — confirmado funcionando em produção.
  const connection = connectionId ? "&connectionId=" + encodeURIComponent(connectionId) : "";
  return `https://app.appvendorai.com/api/tenants/${tenantId}/webhooks/evolution?secret=${encodeURIComponent(webhookSecret)}${connection}`;
}

// Cria a instância se ainda não existir (idempotente — Evolution API
// retorna 403 "already in use" se já existe, tratado como sucesso) e
// configura o webhook pra apontar pro nosso endpoint. Retorna o QR code
// em base64 pra exibir na tela.
export async function connectInstance(tenantId: string, webhookSecret: string, log?: Logger, connectionId?: string): Promise<{ qrCodeBase64: string | null; alreadyConnected: boolean; instanceName: string }> {
  const instanceName = instanceNameFor(tenantId, connectionId);

  try {
    await evoFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrlFor(tenantId, webhookSecret, connectionId),
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
    });
  } catch (err) {
    // Instância já existe — segue o fluxo normalmente pra pegar o QR
    // code de uma conexão nova (reconectar depois de logout, por ex).
    const message = err instanceof Error ? err.message : "";
    if (!message.includes("already in use") && !message.includes("already exists")) {
      log?.error({ err, tenantId }, "evolution-whatsapp: falha ao criar instância");
      throw err;
    }
  }

  await db.update(agentConfigsTable).set({ evolutionInstanceName: instanceName }).where(eq(agentConfigsTable.tenantId, tenantId));

  const connectRes = await evoFetch(`/instance/connect/${instanceName}`);
  // Se já estiver conectada, a Evolution API não retorna base64 (nada
  // pra escanear) — nesse caso o status já reflete "open".
  if (connectRes?.instance?.state === "open" || connectRes?.state === "open") {
    return { qrCodeBase64: null, alreadyConnected: true, instanceName };
  }

  const qrCodeBase64 = connectRes?.base64 ?? connectRes?.qrcode?.base64 ?? null;
  return { qrCodeBase64, alreadyConnected: false, instanceName };
}

export async function getConnectionState(tenantId: string, instanceOverride?: string): Promise<"open" | "connecting" | "close"> {
  const instanceName = instanceOverride || instanceNameFor(tenantId);
  try {
    const res = await evoFetch(`/instance/connectionState/${instanceName}`);
    const state = res?.instance?.state ?? res?.state;
    if (state === "open" || state === "connecting" || state === "close") return state;
    return "close";
  } catch {
    return "close";
  }
}

export interface EvolutionMediaResult {
  mediaType: string;
  fileName: string | null;
  mimetype: string | null;
  base64: string;
}

export interface EvolutionContactNames {
  savedName: string | null;
  whatsappName: string | null;
}

function nonEmptyContactName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Busca os nomes conhecidos do contato sincronizado pela Evolution.
 *
 * savedName representa o nome da agenda quando a versão/provedor da Evolution
 * expõe esse campo. whatsappName representa o nome de perfil (pushName).
 * Nem todas as versões da Evolution/Baileys disponibilizam o nome salvo no
 * aparelho; por isso ambos são opcionais e o chamador mantém fallback seguro.
 */
export async function findEvolutionContactNames(
  tenantId: string,
  remoteJid: string,
  instanceOverride?: string,
): Promise<EvolutionContactNames> {
  const instanceName = instanceOverride || instanceNameFor(tenantId);
  const body = await evoFetch(`/chat/findContacts/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ where: { remoteJid } }),
  });

  const contacts: Array<Record<string, unknown>> =
    Array.isArray(body) ? body :
    Array.isArray(body?.contacts) ? body.contacts :
    Array.isArray(body?.data) ? body.data :
    Array.isArray(body?.response) ? body.response :
    [];

  const normalizedJid = remoteJid.replace(/\D/g, "");
  const exact = contacts.find((contact) => {
    const candidate = String(contact["remoteJid"] ?? contact["id"] ?? "");
    return candidate === remoteJid || candidate.replace(/\D/g, "") === normalizedJid;
  });
  const contact = exact ?? contacts[0] ?? null;

  if (!contact) return { savedName: null, whatsappName: null };

  return {
    savedName:
      nonEmptyContactName(contact["savedName"]) ??
      nonEmptyContactName(contact["contactName"]) ??
      nonEmptyContactName(contact["name"]),
    whatsappName:
      nonEmptyContactName(contact["pushName"]) ??
      nonEmptyContactName(contact["notifyName"]),
  };
}

// Busca o conteúdo real (base64) de uma mensagem de mídia recebida —
// usado pelo webhook ao processar áudio/imagem/documento. Preferido em
// vez de configurar webhook_base64:true na criação da instância: o
// campo inline tem bugs reportados na Evolution API dependendo da
// versão (base64 ausente mesmo com a opção ativada); esse endpoint
// dedicado busca sob demanda e é o caminho documentado como mais
// confiável.
export async function getBase64FromMediaMessage(tenantId: string, messageId: string, instanceOverride?: string): Promise<EvolutionMediaResult> {
  const instanceName = instanceOverride || instanceNameFor(tenantId);
  const body = await evoFetch(`/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ message: { key: { id: messageId } } }),
  });
  return {
    mediaType: body?.mediaType ?? "",
    fileName: body?.fileName ?? null,
    mimetype: body?.mimetype ?? null,
    base64: body?.base64 ?? "",
  };
}

export async function disconnectInstance(tenantId: string, log?: Logger, instanceOverride?: string): Promise<void> {
  const instanceName = instanceOverride || instanceNameFor(tenantId);
  try {
    await evoFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
  } catch (err) {
    log?.error({ err, tenantId }, "evolution-whatsapp: falha ao desconectar (logout)");
  }
  await db
    .update(agentConfigsTable)
    .set({ evolutionConnected: false, evolutionPhone: null })
    .where(eq(agentConfigsTable.tenantId, tenantId));
}

export async function sendEvolutionWhatsAppMessage(instanceName: string, phone: string, message: string, log: Logger): Promise<void> {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const normalized = digits.startsWith("55") ? digits : "55" + digits;

  const body = await evoFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number: normalized, text: message }),
  });
  log.info({ phone: normalized, messageId: body?.key?.id ?? null }, "omnichannel: whatsapp message sent via evolution-api");
}

export async function sendEvolutionDocument(instanceName: string, phone: string, pdfBuffer: Buffer, fileName: string, caption: string, log: Logger): Promise<void> {
  await sendEvolutionMedia(instanceName, phone, pdfBuffer, "application/pdf", fileName, caption, log);
}

// Generaliza sendEvolutionDocument pra qualquer tipo de mídia (usado
// pelo botão de anexar do chat interno — imagem/vídeo/documento/áudio,
// não só PDF de orçamento). Evolution API aceita mediatype genérico no
// mesmo endpoint /message/sendMedia.
export async function sendEvolutionMedia(instanceName: string, phone: string, buffer: Buffer, mimeType: string, fileName: string, caption: string, log: Logger): Promise<void> {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const normalized = digits.startsWith("55") ? digits : "55" + digits;
  const base64 = buffer.toString("base64");
  const mediatype = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "document";

  await evoFetch(`/message/sendMedia/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: normalized,
      mediatype,
      mimetype: mimeType,
      media: `data:${mimeType};base64,${base64}`,
      fileName,
      caption,
    }),
  });
  log.info({ phone: normalized, fileName, mediatype }, "omnichannel: media sent via evolution-api");
}
