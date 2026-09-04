import { Resend } from "resend";
import { logger } from "./logger.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function from(displayName: string): string {
  const safeName = displayName.replace(/[\r\n<>]/g, " ").trim().slice(0, 80) || "Aplicativo";
  const fullEmail = process.env["RESEND_FROM_EMAIL"];
  if (fullEmail) return `${safeName} <${fullEmail}>`;
  const domain = process.env["RESEND_FROM_DOMAIN"] ?? "vendorai.app";
  return `${safeName} <acesso@${domain}>`;
}

export async function sendAppUserLoginCodeEmail(input: {
  to: string;
  code: string;
  appName: string;
  expiresMinutes: number;
}): Promise<boolean> {
  const resend = process.env["RESEND_API_KEY"]
    ? new Resend(process.env["RESEND_API_KEY"])
    : null;

  if (!resend) {
    logger.warn({ to: input.to }, "APP_USER_AUTH: RESEND_API_KEY not configured");
    return false;
  }

  const appName = escapeHtml(input.appName);
  const code = escapeHtml(input.code);
  const { error } = await resend.emails.send({
    from: from(input.appName),
    to: input.to,
    subject: `Seu código de acesso — ${input.appName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;">
        <h1 style="font-size:22px;color:#111;margin:0 0 12px;">Acessar ${appName}</h1>
        <p style="color:#555;line-height:1.6;">Use o código abaixo para continuar:</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;padding:18px 20px;background:#f4f4f5;border-radius:10px;text-align:center;margin:22px 0;">${code}</div>
        <p style="color:#777;font-size:13px;line-height:1.5;">O código expira em ${input.expiresMinutes} minutos e pode ser usado uma única vez. Se você não solicitou este acesso, ignore esta mensagem.</p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to: input.to }, "APP_USER_AUTH: failed to send login code");
    return false;
  }
  return true;
}
