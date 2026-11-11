import { Resend } from "resend";

/** Existing Vendor.ai Resend infrastructure; no new provider or mail queue. */
export async function sendGlobalCustomerVerificationEmail(input: {
  to: string;
  code: string;
  resendApiKey?: string;
  fromEmail?: string;
  fromDomain?: string;
}): Promise<boolean> {
  const email = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 ||
      !/^[0-9a-f]{64}$/.test(input.code) || !input.resendApiKey) return false;
  const sender = input.fromEmail
    ? `Vendor.ai <${input.fromEmail}>`
    : `Vendor.ai <noreply@${input.fromDomain || "vendorai.app"}>`;
  try {
    const resend = new Resend(input.resendApiKey);
    const { error } = await resend.emails.send({
      from: sender,
      to: email,
      subject: "Confirme seu e-mail — Portal do Cliente Vendor.ai",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px">
        <h1 style="font-size:22px">Confirme seu e-mail</h1>
        <p>Use o código abaixo para ativar sua identidade no Portal do Cliente.</p>
        <div style="font-family:monospace;font-size:19px;word-break:break-all;padding:16px;background:#f4f4f5">${input.code}</div>
        <p>Este código expira em 15 minutos e pode ser utilizado somente uma vez.</p>
        <p>Se você não solicitou esta confirmação, ignore esta mensagem.</p>
      </div>`,
    });
    return !error;
  } catch {
    // Do not expose provider internals or verification codes in logs.
    return false;
  }
}
