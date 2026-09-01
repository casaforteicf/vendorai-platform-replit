import { Resend } from "resend";
import type { TrialActivationSnapshot } from "../jobs/trialJourney.js";
import { logger } from "./logger.js";

function fromAddress(): string {
  const fullEmail = process.env["RESEND_FROM_EMAIL"];
  if (fullEmail) return `VendorAI <${fullEmail}>`;
  const domain = process.env["RESEND_FROM_DOMAIN"] ?? "vendorai.app";
  return `VendorAI <noreply@${domain}>`;
}

function item(done: boolean, label: string) {
  return `<li style="margin:7px 0;color:${done ? "#166534" : "#6b7280"};">${done ? "✓" : "○"} ${label}</li>`;
}

function getResend() {
  return process.env["RESEND_API_KEY"] ? new Resend(process.env["RESEND_API_KEY"]) : null;
}

export async function sendTrialJourneyEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  day: number;
  subject: string;
  headline: string;
  snapshot: TrialActivationSnapshot;
  dashboardUrl: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    logger.warn({ to: opts.to }, "trial-email: RESEND_API_KEY não configurada");
    return false;
  }

  const { snapshot } = opts;
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: opts.to,
    subject: opts.subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;color:#111827;">
        <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">VendorAI · Dia ${opts.day} de 5 · ${opts.companyName}</p>
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;">${opts.headline}</h1>
        <p style="color:#4b5563;line-height:1.6;">Olá, ${opts.name}. Seu <strong>Activation Score está em ${snapshot.score}/100</strong>. Ele mede uso real do produto, não apenas acesso ao painel.</p>

        <div style="margin:22px 0;padding:18px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
          <div style="font-size:12px;color:#6b7280;">Próxima ação recomendada</div>
          <div style="font-size:16px;font-weight:600;margin-top:5px;">${snapshot.nextAction}</div>
        </div>

        <ul style="padding-left:20px;line-height:1.5;">
          ${item(snapshot.firstLogin, "Primeiro acesso realizado")}
          ${item(snapshot.onboardingComplete, "Onboarding concluído")}
          ${item(snapshot.integrationsComplete, "Integração/canal concluído")}
          ${item(snapshot.realLeads > 0, `Lead real no sistema (${snapshot.realLeads})`)}
          ${item(snapshot.messages > 0, `Mensagens processadas (${snapshot.messages})`)}
          ${item(snapshot.deals > 0, `Oportunidade criada (${snapshot.deals})`)}
        </ul>

        <a href="${opts.dashboardUrl}" style="display:inline-block;margin:20px 0;padding:12px 22px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Continuar no VendorAI</a>

        <p style="font-size:13px;color:#6b7280;line-height:1.5;">Restam aproximadamente <strong>${snapshot.daysRemaining} dia(s)</strong> no trial. Seus dados permanecem na conta; se quiser continuar, solicite a continuidade pelo painel para o comercial manter a mesma operação.</p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to: opts.to }, "trial-email: envio falhou");
    return false;
  }
  return true;
}

export async function sendVendorAiSubscriptionChargeEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  amount: string;
  dueDate: Date;
  invoiceUrl: string;
  phaseLabel: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    logger.warn({ to: opts.to }, "subscription-email: RESEND_API_KEY não configurada");
    return false;
  }

  const amount = Number(opts.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const due = opts.dueDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: opts.to,
    subject: `VendorAI — mensalidade ${amount} com vencimento em ${due}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;color:#111827;">
        <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">VendorAI · ${opts.companyName}</p>
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;">Sua continuidade no VendorAI</h1>
        <p style="color:#4b5563;line-height:1.6;">Olá, ${opts.name}. A cobrança da sua assinatura está disponível. Esta cobrança corresponde à fase <strong>${opts.phaseLabel}</strong> da oferta aceita.</p>
        <div style="margin:22px 0;padding:18px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
          <div style="font-size:13px;color:#6b7280;">Valor</div>
          <div style="font-size:26px;font-weight:700;margin:4px 0 12px;">${amount}</div>
          <div style="font-size:13px;color:#4b5563;">Vencimento: <strong>${due}</strong></div>
        </div>
        <a href="${opts.invoiceUrl}" style="display:inline-block;margin:6px 0 20px;padding:12px 22px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Abrir cobrança</a>
        <p style="font-size:13px;color:#6b7280;line-height:1.5;">O pagamento confirmado pelo Asaas ativa ou mantém a mesma conta, com os dados e configurações do trial preservados.</p>
      </div>
    `,
  });

  if (error) {
    logger.warn({ error, to: opts.to }, "subscription-email: envio falhou");
    return false;
  }
  return true;
}
