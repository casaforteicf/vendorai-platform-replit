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

function from(): string {
  const fullEmail = process.env["RESEND_FROM_EMAIL"];
  if (fullEmail) return `VendorAI Obras <${fullEmail}>`;
  const domain = process.env["RESEND_FROM_DOMAIN"] ?? "vendorai.app";
  return `VendorAI Obras <acesso@${domain}>`;
}

export async function sendObraFieldInviteEmail(input: {
  to: string;
  executorName: string;
  obraName: string;
  inviteUrl: string;
  expiresDays: number;
}): Promise<boolean> {
  const resend = process.env["RESEND_API_KEY"]
    ? new Resend(process.env["RESEND_API_KEY"])
    : null;

  if (!resend) {
    logger.warn({ to: input.to }, "OBRA_FIELD_ACCESS: RESEND_API_KEY not configured");
    return false;
  }

  const executorName = escapeHtml(input.executorName);
  const obraName = escapeHtml(input.obraName);
  const inviteUrl = escapeHtml(input.inviteUrl);

  const { error } = await resend.emails.send({
    from: from(),
    to: input.to,
    subject: `Acesso à obra — ${input.obraName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;">
        <h1 style="font-size:22px;color:#111;margin:0 0 12px;">Seu acesso à obra</h1>
        <p style="color:#444;line-height:1.6;">Olá, <strong>${executorName}</strong>.</p>
        <p style="color:#444;line-height:1.6;">Você foi convidado para acompanhar e registrar atividades da obra <strong>${obraName}</strong>.</p>
        <div style="margin:24px 0;">
          <a href="${inviteUrl}" style="display:inline-block;background:#111827;color:white;text-decoration:none;padding:13px 18px;border-radius:9px;font-weight:700;">Ativar meu acesso</a>
        </div>
        <p style="color:#666;font-size:13px;line-height:1.5;">O convite expira em ${input.expiresDays} dias. Depois da ativação, você verá somente as informações e ações liberadas para seu perfil nesta obra.</p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to: input.to }, "OBRA_FIELD_ACCESS: failed to send invite email");
    return false;
  }
  return true;
}
