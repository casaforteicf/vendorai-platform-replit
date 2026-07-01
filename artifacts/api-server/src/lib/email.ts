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

// ── AI failure alert ─────────────────────────────────────────────────────────

// In-memory throttle: max 1 alert per error key per 15 minutes
const alertThrottle = new Map<string, number>();
const THROTTLE_MS = 15 * 60 * 1000;

export async function sendAiFailureAlert(params: {
  provider: "openai" | "anthropic";
  errorType: string; // e.g. "429_quota", "400_billing", "502_error"
  feature: string;
  tenantId?: string;
  model: string;
  message: string;
}): Promise<void> {
  const alertTo = process.env["ALERT_EMAIL"];
  if (!alertTo || !resend) return;

  // Throttle: same provider+errorType → at most 1 email per 15 min
  const throttleKey = `${params.provider}:${params.errorType}`;
  const lastSent = alertThrottle.get(throttleKey) ?? 0;
  const now = Date.now();
  if (now - lastSent < THROTTLE_MS) return;
  alertThrottle.set(throttleKey, now);

  const providerLabel = params.provider === "openai" ? "OpenAI" : "Anthropic";
  const errorLabels: Record<string, string> = {
    "429_quota":    "🔴 Quota / Rate Limit (429)",
    "400_billing":  "🔴 Saldo esgotado (400 Billing)",
    "502_error":    "🟡 Erro inesperado (502)",
  };
  const errorLabel = errorLabels[params.errorType] ?? `⚠️ ${params.errorType}`;
  const ts = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const billingUrl = params.provider === "openai"
    ? "https://platform.openai.com/account/billing/overview"
    : "https://console.anthropic.com/settings/billing";

  const needsRecharge = params.errorType === "429_quota" || params.errorType === "400_billing";

  const { error } = await resend.emails.send({
    from: "VendorAI Alertas <alertas@vendorai.app>",
    to: alertTo,
    subject: `[VendorAI] Falha de API — ${providerLabel} ${errorLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#fff;">
        <div style="border-left:4px solid #ef4444;padding:0 0 0 16px;margin-bottom:24px;">
          <h1 style="font-size:18px;color:#111;margin:0 0 4px;">Falha de API detectada</h1>
          <p style="color:#6b7280;font-size:13px;margin:0;">${ts}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <tr style="background:#f9fafb;">
            <td style="padding:10px 12px;font-weight:600;width:140px;">Provedor</td>
            <td style="padding:10px 12px;">${providerLabel}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-weight:600;">Tipo de erro</td>
            <td style="padding:10px 12px;">${errorLabel}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:10px 12px;font-weight:600;">Modelo</td>
            <td style="padding:10px 12px;">${params.model}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-weight:600;">Feature</td>
            <td style="padding:10px 12px;">${params.feature}</td>
          </tr>
          ${params.tenantId ? `
          <tr style="background:#f9fafb;">
            <td style="padding:10px 12px;font-weight:600;">Tenant ID</td>
            <td style="padding:10px 12px;font-family:monospace;">${params.tenantId}</td>
          </tr>` : ""}
          <tr style="${params.tenantId ? "" : "background:#f9fafb;"}">
            <td style="padding:10px 12px;font-weight:600;vertical-align:top;">Mensagem</td>
            <td style="padding:10px 12px;font-family:monospace;font-size:12px;word-break:break-all;">${params.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
          </tr>
        </table>
        ${needsRecharge ? `
        <div style="margin-top:24px;text-align:center;">
          <a href="${billingUrl}"
             style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
            💳 Recarregar saldo — ${providerLabel}
          </a>
          <p style="color:#6b7280;font-size:12px;margin-top:8px;">${billingUrl}</p>
        </div>` : ""}
        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
          Próximo alerta do mesmo tipo será enviado somente após 15 minutos.
        </p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, alertTo }, "ai-failure-alert: failed to send via Resend");
  } else {
    logger.info({ provider: params.provider, errorType: params.errorType }, "ai-failure-alert: sent");
  }
}

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
