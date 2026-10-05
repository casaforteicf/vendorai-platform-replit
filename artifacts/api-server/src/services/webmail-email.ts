import net from "node:net";
import tls from "node:tls";
import { once } from "node:events";
import { and, eq, isNull } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import { decrypt, encrypt } from "../lib/crypto.js";

const WEBMAIL_PROVIDER = "email_webmail";

export type WebmailConfig = {
  email: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpStartTls: boolean;
  signature?: string;
};

type SocketLike = net.Socket | tls.TLSSocket;

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function encodeHeader(value: string) {
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

function dotStuff(text: string) {
  return text.replace(/^\./gm, "..");
}

function buildMime(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  cc?: string[];
  attachment?: { filename: string; mimeType: string; content: Buffer };
}) {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@vendorai.local>`,
    "MIME-Version: 1.0",
  ];
  if (!input.attachment) {
    return [...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", input.text].join("\r\n");
  }
  const boundary = `vendorai_${crypto.randomUUID().replace(/-/g, "")}`;
  const attachmentB64 = input.attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    `Content-Type: ${input.attachment.mimeType}; name="${input.attachment.filename.replace(/"/g, "")}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${input.attachment.filename.replace(/"/g, "")}"`,
    "",
    attachmentB64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

class BufferedSocket {
  private buffer = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  constructor(public socket: SocketLike) {
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      const waiters = this.waiters.splice(0);
      for (const wake of waiters) wake();
    });
  }
  async waitFor(predicate: (buffer: Buffer) => number, timeoutMs = 15000): Promise<Buffer> {
    const started = Date.now();
    while (true) {
      const end = predicate(this.buffer);
      if (end >= 0) {
        const out = this.buffer.subarray(0, end);
        this.buffer = this.buffer.subarray(end);
        return out;
      }
      if (Date.now() - started > timeoutMs) throw new Error("mail_server_timeout");
      await Promise.race([
        new Promise<void>((resolve) => this.waiters.push(resolve)),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("mail_server_timeout")), Math.min(1000, timeoutMs))),
      ]);
    }
  }
  write(data: string | Buffer) {
    this.socket.write(data);
  }
  detach() {
    this.socket.removeAllListeners("data");
    return this.buffer;
  }
}

function lineEnd(buffer: Buffer) {
  const idx = buffer.indexOf("\r\n");
  return idx >= 0 ? idx + 2 : -1;
}

async function connectSocket(host: string, port: number, secure: boolean): Promise<SocketLike> {
  const socket = secure
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
    : net.connect({ host, port });
  await once(socket, secure ? "secureConnect" : "connect");
  socket.setTimeout(20000, () => socket.destroy(new Error("mail_socket_timeout")));
  return socket;
}

async function smtpResponse(reader: BufferedSocket) {
  const first = (await reader.waitFor(lineEnd)).toString("utf8");
  const code = first.slice(0, 3);
  let text = first;
  if (first[3] === "-") {
    while (true) {
      const line = (await reader.waitFor(lineEnd)).toString("utf8");
      text += line;
      if (line.startsWith(code + " ")) break;
    }
  }
  const numeric = Number(code);
  if (!Number.isFinite(numeric)) throw new Error("smtp_invalid_response");
  return { code: numeric, text };
}

async function smtpCommand(reader: BufferedSocket, command: string, expected: number[]) {
  reader.write(command + "\r\n");
  const response = await smtpResponse(reader);
  if (!expected.some((code) => Math.floor(response.code / 100) === Math.floor(code / 100) || response.code === code)) {
    throw new Error(`smtp_command_failed:${response.code}`);
  }
  return response;
}

async function openSmtp(config: WebmailConfig) {
  let socket = await connectSocket(config.smtpHost, config.smtpPort, config.smtpSecure);
  let reader = new BufferedSocket(socket);
  const greeting = await smtpResponse(reader);
  if (greeting.code !== 220) throw new Error(`smtp_greeting_failed:${greeting.code}`);
  await smtpCommand(reader, "EHLO vendorai.local", [250]);

  if (!config.smtpSecure && config.smtpStartTls) {
    await smtpCommand(reader, "STARTTLS", [220]);
    const pending = reader.detach();
    socket.removeAllListeners();
    const upgraded = tls.connect({ socket, servername: config.smtpHost, rejectUnauthorized: true });
    await once(upgraded, "secureConnect");
    socket = upgraded;
    reader = new BufferedSocket(socket);
    if (pending.length) {
      // STARTTLS should not leave protocol bytes; discard defensively.
    }
    await smtpCommand(reader, "EHLO vendorai.local", [250]);
  }

  await smtpCommand(reader, "AUTH LOGIN", [334]);
  await smtpCommand(reader, Buffer.from(config.username).toString("base64"), [334]);
  await smtpCommand(reader, Buffer.from(config.password).toString("base64"), [235]);
  return { socket, reader };
}

export async function testWebmailSmtp(config: WebmailConfig) {
  const { socket, reader } = await openSmtp(config);
  try {
    await smtpCommand(reader, "NOOP", [250]);
    await smtpCommand(reader, "QUIT", [221]).catch(() => undefined);
  } finally {
    socket.end();
  }
}

async function imapTagged(reader: BufferedSocket, tag: string) {
  return reader.waitFor((buffer) => {
    const text = buffer.toString("latin1");
    const marker = `\r\n${tag} `;
    let idx = text.indexOf(marker);
    if (idx < 0 && text.startsWith(tag + " ")) idx = 0;
    if (idx < 0) return -1;
    const end = text.indexOf("\r\n", idx + (idx === 0 ? 0 : 2));
    return end >= 0 ? end + 2 : -1;
  }, 30000);
}

async function imapCommand(reader: BufferedSocket, tag: string, command: string) {
  reader.write(`${tag} ${command}\r\n`);
  const response = await imapTagged(reader, tag);
  const text = response.toString("latin1");
  const statusLine = text.split("\r\n").find((line) => line.startsWith(tag + " ")) ?? "";
  if (!new RegExp(`^${tag} OK\\b`, "i").test(statusLine)) {
    throw new Error(`imap_command_failed:${statusLine || "unknown"}`);
  }
  return response;
}

async function openImap(config: WebmailConfig) {
  let socket = await connectSocket(config.imapHost, config.imapPort, config.imapSecure);
  let reader = new BufferedSocket(socket);
  const greeting = (await reader.waitFor(lineEnd)).toString("utf8");
  if (!/^\* (OK|PREAUTH)/i.test(greeting)) throw new Error("imap_greeting_failed");

  if (!config.imapSecure) {
    const tag = "A000";
    reader.write(`${tag} STARTTLS\r\n`);
    const response = await imapTagged(reader, tag);
    if (!response.toString("latin1").includes(`${tag} OK`)) throw new Error("imap_starttls_failed");
    reader.detach();
    socket.removeAllListeners();
    const upgraded = tls.connect({ socket, servername: config.imapHost, rejectUnauthorized: true });
    await once(upgraded, "secureConnect");
    socket = upgraded;
    reader = new BufferedSocket(socket);
  }

  await imapCommand(reader, "A001", `LOGIN ${quoteImap(config.username)} ${quoteImap(config.password)}`);
  return { socket, reader };
}

export async function testWebmailImap(config: WebmailConfig) {
  const { socket, reader } = await openImap(config);
  try {
    await imapCommand(reader, "A002", 'SELECT "INBOX"');
    await imapCommand(reader, "A003", "LOGOUT").catch(() => undefined);
  } finally {
    socket.end();
  }
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeMimeWord(value: string) {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_m, _charset, encoding, data) => {
    try {
      return String(encoding).toLowerCase() === "b"
        ? Buffer.from(data, "base64").toString("utf8")
        : Buffer.from(decodeQuotedPrintable(String(data).replace(/_/g, " ")), "latin1").toString("utf8");
    } catch {
      return data;
    }
  });
}

function unfoldHeaders(raw: string) {
  return raw.replace(/\r?\n[ \t]+/g, " ");
}

function extractTextFromMime(raw: string) {
  const [headerPart = "", ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const headers = unfoldHeaders(headerPart);
  const body = bodyParts.join("\r\n\r\n");
  const contentType = /content-type:\s*([^;\r\n]+)(?:;[^\r\n]*)?/i.exec(headers)?.[1]?.toLowerCase() ?? "text/plain";
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(headers)?.[1];

  if (contentType.startsWith("multipart/") && boundary) {
    const parts = body.split(`--${boundary}`);
    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        return extractTextFromMime(part.replace(/^\r?\n/, ""));
      }
    }
    for (const part of parts) {
      if (/content-type:\s*text\/html/i.test(part)) {
        return extractTextFromMime(part.replace(/^\r?\n/, "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  const transfer = /content-transfer-encoding:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase();
  let decoded = body;
  if (transfer === "base64") {
    try { decoded = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8"); } catch {}
  } else if (transfer === "quoted-printable") {
    decoded = Buffer.from(decodeQuotedPrintable(body), "latin1").toString("utf8");
  }
  if (contentType === "text/html") decoded = decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return decoded.trim();
}

function parseRawEmail(raw: Buffer) {
  const text = raw.toString("latin1");
  const split = text.search(/\r?\n\r?\n/);
  const headerText = unfoldHeaders(split >= 0 ? text.slice(0, split) : text);
  const get = (name: string) => {
    const match = new RegExp(`^${name}:\\s*(.*)$`, "im").exec(headerText);
    return decodeMimeWord(match?.[1]?.trim() ?? "");
  };
  const fromRaw = get("From");
  const addressMatch = /<([^>]+)>/.exec(fromRaw);
  const from = (addressMatch?.[1] ?? fromRaw).trim().toLowerCase();
  const messageId = get("Message-ID").replace(/[<>]/g, "");
  const references = get("References") || get("In-Reply-To");
  const dateRaw = get("Date");
  return {
    from,
    subject: get("Subject"),
    messageId,
    threadId: references || messageId || null,
    receivedAt: dateRaw && !Number.isNaN(new Date(dateRaw).getTime()) ? new Date(dateRaw) : new Date(),
    text: extractTextFromMime(text),
  };
}

export async function fetchWebmailMessages(config: WebmailConfig, limit = 50) {
  const { socket, reader } = await openImap(config);
  try {
    await imapCommand(reader, "A002", 'SELECT "INBOX"');
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const date = `${String(since.getUTCDate()).padStart(2, "0")}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][since.getUTCMonth()]}-${since.getUTCFullYear()}`;
    const search = await imapCommand(reader, "A003", `UID SEARCH SINCE ${date}`);
    const searchLine = search.toString("latin1").split("\r\n").find((line) => /^\* SEARCH/i.test(line)) ?? "";
    const uids = searchLine.replace(/^\* SEARCH\s*/i, "").trim().split(/\s+/).filter(Boolean).slice(-limit);
    const messages: Array<ReturnType<typeof parseRawEmail> & { uid: string }> = [];
    let seq = 4;
    for (const uid of uids) {
      const tag = `A${String(seq++).padStart(3, "0")}`;
      const response = await imapCommand(reader, tag, `UID FETCH ${uid} (BODY.PEEK[])`);
      const marker = /\{(\d+)\}\r\n/.exec(response.toString("latin1"));
      if (!marker || marker.index === undefined) continue;
      const start = marker.index + marker[0].length;
      const length = Number(marker[1]);
      const raw = response.subarray(start, start + length);
      messages.push({ uid, ...parseRawEmail(raw) });
    }
    await imapCommand(reader, `A${String(seq).padStart(3, "0")}`, "LOGOUT").catch(() => undefined);
    return messages;
  } finally {
    socket.end();
  }
}

export async function sendWebmailEmail(config: WebmailConfig, input: {
  to: string;
  subject: string;
  text: string;
  cc?: string[];
  bcc?: string[];
  attachment?: { filename: string; mimeType: string; content: Buffer };
}) {
  const { socket, reader } = await openSmtp(config);
  try {
    const recipients = [input.to, ...(input.cc ?? []), ...(input.bcc ?? [])].filter(Boolean);
    await smtpCommand(reader, `MAIL FROM:<${config.email}>`, [250]);
    for (const recipient of recipients) {
      await smtpCommand(reader, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await smtpCommand(reader, "DATA", [354]);
    const text = config.signature?.trim() ? `${input.text}\n\n${config.signature.trim()}` : input.text;
    const mime = buildMime({ from: config.email, to: input.to, subject: input.subject, text, cc: input.cc, attachment: input.attachment });
    reader.write(dotStuff(mime) + "\r\n.\r\n");
    const sent = await smtpResponse(reader);
    if (Math.floor(sent.code / 100) !== 2) throw new Error(`smtp_send_failed:${sent.code}`);
    await smtpCommand(reader, "QUIT", [221]).catch(() => undefined);
    const id = /queued as\s+([^\s]+)/i.exec(sent.text)?.[1];
    return { externalId: id };
  } finally {
    socket.end();
  }
}

export async function saveWebmailConnection(tenantId: string, config: WebmailConfig) {
  await testWebmailImap(config);
  await testWebmailSmtp(config);
  const existing = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    eq(socialConnectionsTable.provider, WEBMAIL_PROVIDER),
  )).limit(1).then((rows) => rows[0] ?? null);
  const metadata = {
    email: config.email.trim().toLowerCase(),
    username: config.username,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSecure: config.imapSecure,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpStartTls: config.smtpStartTls,
    signature: config.signature?.trim() ?? "",
    channel: "email",
    provider: "webmail",
    identityRole: "operational",
  };
  const values = {
    externalAccountId: config.email.trim().toLowerCase(),
    accountName: config.email.trim().toLowerCase(),
    accessToken: encrypt(config.password),
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: ["imap", "smtp"],
    status: "active",
    disconnectedAt: null,
    metadata,
    updatedAt: new Date(),
  };
  if (existing) {
    return db.update(socialConnectionsTable).set(values).where(eq(socialConnectionsTable.id, existing.id)).returning().then((rows) => rows[0]);
  }
  return db.insert(socialConnectionsTable).values({ tenantId, provider: WEBMAIL_PROVIDER, ...values }).returning().then((rows) => rows[0]);
}

export async function getWebmailConnection(tenantId: string) {
  return db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    eq(socialConnectionsTable.provider, WEBMAIL_PROVIDER),
    eq(socialConnectionsTable.status, "active"),
    isNull(socialConnectionsTable.disconnectedAt),
  )).limit(1).then((rows) => rows[0] ?? null);
}

export function webmailConfigFromConnection(connection: typeof socialConnectionsTable.$inferSelect): WebmailConfig {
  const metadata = connection.metadata ?? {};
  return {
    email: String(metadata["email"] ?? connection.accountName ?? ""),
    username: String(metadata["username"] ?? metadata["email"] ?? connection.accountName ?? ""),
    password: decrypt(connection.accessToken),
    imapHost: String(metadata["imapHost"] ?? ""),
    imapPort: Number(metadata["imapPort"] ?? 993),
    imapSecure: metadata["imapSecure"] !== false,
    smtpHost: String(metadata["smtpHost"] ?? ""),
    smtpPort: Number(metadata["smtpPort"] ?? 465),
    smtpSecure: metadata["smtpSecure"] !== false,
    smtpStartTls: metadata["smtpStartTls"] === true,
    signature: typeof metadata["signature"] === "string" ? metadata["signature"] : "",
  };
}

export async function disconnectWebmail(tenantId: string) {
  await db.update(socialConnectionsTable).set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, WEBMAIL_PROVIDER)));
}

export async function updateWebmailSettings(tenantId: string, settings: { signature?: string }) {
  const connection = await getWebmailConnection(tenantId);
  if (!connection) return null;
  const metadata = {
    ...(connection.metadata ?? {}),
    ...(settings.signature !== undefined ? { signature: settings.signature.trim() } : {}),
  };
  return db.update(socialConnectionsTable).set({ metadata, updatedAt: new Date() })
    .where(eq(socialConnectionsTable.id, connection.id)).returning().then((rows) => rows[0] ?? null);
}
