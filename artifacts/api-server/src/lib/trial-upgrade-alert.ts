import { Resend } from "resend";
import { logger } from "./logger.js";

function fromAddress(): string {
  const fullEmail = process.env["RESEND_FROM_EMAIL"];
  if (fullEmail) return `VendorAI <${fullEmail}>`;
  const domain = process.env["RESEND_FROM_DOMAIN"] ?? "vendorai.app";
  return `VendorAI Comercial <alertas@${domain}>`;
}

function recipientsFromEnv(): string[] {
  return [process.env["SALES_ALERT_EMAIL"], process.env["ALERT_EMAIL"]]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function uniqueRecipients(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

export async function sendTrialUpgradeRequestedAlert(opts: {
  to?: string[];
  leadName: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
  activationScore: number;
  trialTenantId: string;
  requestedAt?: Date;
}): Promise<boolean> {
  const resend = process.env["RESEND_API_KEY"]
    ? new Resend(process.env["RESEND_API_KEY"])
    : null;
  const recipients = uniqueRecipients([...(opts.to ?? []), ...recipientsFromEnv()]);

  if (!resend) {
    logger.warn({ companyName: opts.companyName }, "trial-upgrade-alert: RESEND_API_KEY não configurada");
    return false;
  }
  if (recipients.length === 0) {
    logger.warn({ companyName: opts.companyName }, "trial-upgrade-alert: nenhum destinatário comercial encontrado");
    return false;
  }

  const leadName = escapeHtml(opts.leadName);
  const companyName = escapeHtml(opts.companyName);
  const email = opts.email ? escapeHtml(opts.email) : "Não informado";
  const phone = opts.phone ? escapeHtml(opts.phone) : "Não informado";
  const requestedAt = (opts.requestedAt ?? new Date()).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: recipients,
    subject: `🔥 Trial quer continuar — ${opts.companyName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:28px;color:#111827;">
        <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">VendorAI · oportunidade comercial de alta prioridade</p>
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;">O cliente pediu continuidade do trial</h1>
        <p style="color:#4b5563;line-height:1.6;">O pedido foi feito pelo próprio painel. O contato abaixo deve entrar na fila comercial imediatamente.</p>

        <div style="margin:22px 0;padding:18px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
          <p style="margin:0 0 8px;"><strong>Empresa:</strong> ${companyName}</p>
          <p style="margin:0 0 8px;"><strong>Contato:</strong> ${leadName}</p>
          <p style="margin:0 0 8px;"><strong>E-mail:</strong> ${email}</p>
          <p style="margin:0 0 8px;"><strong>Telefone:</strong> ${phone}</p>
          <p style="margin:0 0 8px;"><strong>Activation Score:</strong> ${opts.activationScore}/100</p>
          <p style="margin:0 0 8px;"><strong>Solicitado em:</strong> ${requestedAt}</p>
          <p style="margin:0;"><strong>Tenant do trial:</strong> ${escapeHtml(opts.trialTenantId)}</p>
        </div>

        <p style="font-size:15px;line-height:1.6;"><strong>Próxima ação:</strong> entrar em contato, definir plano/fechamento e preservar a mesma conta do trial.</p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, recipients, companyName: opts.companyName }, "trial-upgrade-alert: envio falhou");
    return false;
  }

  logger.info({ recipients, companyName: opts.companyName }, "trial-upgrade-alert: enviado");
  return true;
}
