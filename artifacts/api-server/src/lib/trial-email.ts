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
  const resend = process.env["RESEND_API_KEY"] ? new Resend(process.env["RESEND_API_KEY"]) : null;
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
