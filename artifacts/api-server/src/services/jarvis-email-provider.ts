import { Resend } from "resend";

function sender(displayName: string): string {
  const fixed = process.env.RESEND_FROM_EMAIL?.trim();
  if (fixed) return `${displayName} <${fixed}>`;
  const domain = process.env.RESEND_FROM_DOMAIN?.trim() || "vendorai.app";
  return `${displayName} <noreply@${domain}>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendJarvisEmail(input: {
  to: string;
  subject: string;
  body: string;
  tenantName?: string | null;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada no backend");

  const resend = new Resend(apiKey);
  const displayName = input.tenantName?.trim() || "Atendimento";
  const safeBody = escapeHtml(input.body).replace(/\n/g, "<br>");
  const { data, error } = await resend.emails.send({
    from: sender(displayName),
    to: input.to,
    subject: input.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.6;">${safeBody}</div>`,
    text: input.body,
  });

  if (error) throw new Error(error.message || "Resend recusou o envio");
  if (!data?.id) throw new Error("Resend não retornou identificador do envio");
  return { id: data.id };
}
