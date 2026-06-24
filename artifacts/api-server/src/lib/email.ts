import { Resend } from "resend";
import { logger } from "./logger.js";

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  const resendLocal = process.env["RESEND_API_KEY"]
    ? new Resend(process.env["RESEND_API_KEY"])
    : null;

  if (!resendLocal) {
    logger.warn({ to }, "RESEND_API_KEY not configured — password reset email skipped");
    return false;
  }

  const { error } = await resendLocal.emails.send({
    from: "VendorAI <noreply@vendorai.app>",
    to,
    subject: "Redefinir sua senha — VendorAI",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;color:#111;">Redefinir senha</h1>
        <p style="color:#444;line-height:1.6;">
          Recebemos uma solicitação para redefinir a senha da sua conta VendorAI.
          Clique no botão abaixo para criar uma nova senha:
        </p>
        <a
          href="${resetUrl}"
          style="display:inline-block;margin:24px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;"
        >
          Redefinir senha
        </a>
        <p style="color:#888;font-size:13px;margin-top:24px;">
          Este link expira em <strong>1 hora</strong>. Se você não solicitou a
          redefinição de senha, ignore este e-mail — sua senha não será alterada.
        </p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to }, "Failed to send password reset email via Resend");
    return false;
  }

  return true;
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  tenantName: string;
  loginUrl: string;
  tempPassword: string;
}): Promise<boolean> {
  if (!resend) {
    logger.warn({ to: opts.to }, "RESEND_API_KEY not configured — welcome email skipped");
    return false;
  }

  const { error } = await resend.emails.send({
    from: "VendorAI <noreply@vendorai.app>",
    to: opts.to,
    subject: `Seu acesso ao VendorAI está pronto — ${opts.tenantName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;color:#111;">Bem-vindo ao VendorAI, ${opts.name}! 🎉</h1>
        <p style="color:#444;line-height:1.6;">
          Seu acesso à plataforma VendorAI para <strong>${opts.tenantName}</strong> está pronto.
          Use as credenciais abaixo para entrar:
        </p>
        <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;color:#444;font-size:14px;"><strong>Link de acesso:</strong><br>
            <a href="${opts.loginUrl}" style="color:#2563eb;">${opts.loginUrl}</a>
          </p>
          <p style="margin:0 0 8px;color:#444;font-size:14px;"><strong>Login (e-mail):</strong><br>${opts.to}</p>
          <p style="margin:0;color:#444;font-size:14px;"><strong>Senha temporária:</strong><br>
            <span style="font-family:monospace;font-size:16px;background:#fff;padding:2px 8px;border-radius:4px;border:1px solid #ddd;">${opts.tempPassword}</span>
          </p>
        </div>
        <p style="color:#e55;">⚠️ Você será solicitado a trocar a senha no primeiro acesso.</p>
        <a
          href="${opts.loginUrl}"
          style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;"
        >
          Acessar agora
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Se você não solicitou este acesso, ignore este e-mail.
        </p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to: opts.to }, "Failed to send welcome email via Resend");
    return false;
  }

  return true;
}

export async function sendInviteEmail(
  to: string,
  inviteUrl: string,
  tenantName: string,
): Promise<boolean> {
  if (!resend) {
    logger.warn({ to }, "RESEND_API_KEY not configured — invite email skipped");
    return false;
  }

  const { error } = await resend.emails.send({
    from: "VendorAI <convites@vendorai.app>",
    to,
    subject: `Seu acesso ao VendorAI — ${tenantName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;color:#111;">Bem-vindo ao VendorAI!</h1>
        <p style="color:#444;line-height:1.6;">
          Você foi convidado para acessar a plataforma VendorAI de
          <strong>${tenantName}</strong>.
          Clique no botão abaixo para criar sua conta e começar:
        </p>
        <a
          href="${inviteUrl}"
          style="display:inline-block;margin:24px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;"
        >
          Aceitar convite
        </a>
        <p style="color:#888;font-size:13px;margin-top:24px;">
          Este link expira em 7 dias. Se você não solicitou este acesso,
          ignore este e-mail.
        </p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to }, "Failed to send invite email via Resend");
    return false;
  }

  return true;
}
