import { Resend } from "resend";

function cleanDomain(value: string | undefined): string | null {
  const domain = (value ?? "").trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function prospectorEmailAutomationConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env["RESEND_API_KEY"]?.trim() &&
    env["RESEND_WEBHOOK_SECRET"]?.trim() &&
    cleanDomain(env["RESEND_PROSPECTOR_REPLY_DOMAIN"]),
  );
}

export function buildProspectorReplyAddress(
  leadId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const domain = cleanDomain(env["RESEND_PROSPECTOR_REPLY_DOMAIN"]);
  if (!domain) throw new Error("RESEND_PROSPECTOR_REPLY_DOMAIN não configurado");
  const normalizedLeadId = leadId.trim().toLowerCase();
  if (!/^[a-z0-9-]{8,50}$/.test(normalizedLeadId)) {
    throw new Error("Lead ID inválido para endereço de resposta");
  }
  return `prospector+${normalizedLeadId}@${domain}`;
}

export function parseProspectorReplyAddress(value: string): string | null {
  const normalized = extractEmailAddress(value);
  if (!normalized) return null;
  const match = /^prospector\+([a-z0-9-]{8,50})@/i.exec(normalized);
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractEmailAddress(value: string): string | null {
  const trimmed = value.trim();
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(trimmed);
  const candidate = (angle?.[1] ?? trimmed).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function buildProspectorEmailSubject(companyName?: string | null): string {
  const company = (companyName ?? "").trim();
  return company ? `Uma pergunta rápida sobre ${company}` : "Uma pergunta rápida";
}

export async function sendProspectorColdEmail(input: {
  to: string;
  leadId: string;
  subject: string;
  body: string;
  tenantName?: string | null;
  includeOptOut?: boolean;
}): Promise<{ id: string; replyTo: string }> {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");
  if (!prospectorEmailAutomationConfigured()) {
    throw new Error("PROSPECTOR_EMAIL_INBOUND_NOT_CONFIGURED");
  }

  const to = extractEmailAddress(input.to);
  if (!to) throw new Error("Destinatário de e-mail inválido");

  const replyTo = buildProspectorReplyAddress(input.leadId);
  const fixedFrom = process.env["RESEND_FROM_EMAIL"]?.trim();
  const fromDomain = cleanDomain(process.env["RESEND_FROM_DOMAIN"]) ?? "vendorai.app";
  const displayName = (input.tenantName ?? "").trim() || "Equipe Comercial";
  const from = fixedFrom
    ? `${displayName} <${fixedFrom}>`
    : `${displayName} <noreply@${fromDomain}>`;

  const optOut =
    'Se este assunto não for relevante ou você preferir não receber novas mensagens, basta responder "não tenho interesse".';
  const body = input.includeOptOut === false
    ? input.body.trim()
    : `${input.body.trim()}\n\n${optOut}`;
  const html = body
    .split("\n")
    .map((line) => line.trim()
      ? `<p style="margin:0 0 10px;line-height:1.55;color:#374151;">${escapeHtml(line)}</p>`
      : "<br>")
    .join("");

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    replyTo,
    subject: input.subject.trim().slice(0, 120) || "Uma pergunta rápida",
    text: body,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">${html}</div>`,
  });

  if (error) throw new Error(error.message || "Resend recusou o envio");
  if (!data?.id) throw new Error("Resend não retornou identificador do envio");
  return { id: data.id, replyTo };
}
