import { describe, expect, it } from "vitest";
import {
  buildProspectorReplyAddress,
  extractEmailAddress,
  parseProspectorReplyAddress,
  prospectorEmailAutomationConfigured,
  sanitizeProspectorInboundText,
} from "./prospector-email.js";
import { isProspectorOptOut } from "../lib/prospector-consultive.js";

const env = {
  RESEND_API_KEY: "re_test",
  RESEND_WEBHOOK_SECRET: "whsec_test",
  RESEND_PROSPECTOR_REPLY_DOMAIN: "reply.example.com",
  RESEND_PROSPECTOR_RECEIVING_VERIFIED: "true",
} as NodeJS.ProcessEnv;

describe("Prospector email safety", () => {
  it("only enables automation when send, signed inbound and reply domain are all configured", () => {
    expect(prospectorEmailAutomationConfigured(env)).toBe(true);
    expect(prospectorEmailAutomationConfigured({
      RESEND_API_KEY: "re_test",
      RESEND_WEBHOOK_SECRET: "whsec_test",
      RESEND_PROSPECTOR_REPLY_DOMAIN: "reply.example.com",
      RESEND_PROSPECTOR_RECEIVING_VERIFIED: "false",
    } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("builds and parses a lead-scoped reply address only on the configured domain", () => {
    const leadId = "11111111-2222-3333-4444-555555555555";
    const address = buildProspectorReplyAddress(leadId, env);
    expect(address).toBe(`prospector+${leadId}@reply.example.com`);
    expect(parseProspectorReplyAddress(address, env)).toBe(leadId);
    expect(parseProspectorReplyAddress(`prospector+${leadId}@evil.example`, env)).toBeNull();
  });

  it("extracts sender email from display-name format", () => {
    expect(extractEmailAddress("Maria Compras <compras@empresa.com.br>")).toBe("compras@empresa.com.br");
    expect(extractEmailAddress("not-an-email")).toBeNull();
  });

  it("keeps only the new reply and removes quoted thread history", () => {
    const result = sanitizeProspectorInboundText({
      text: "Sim, estamos avaliando isso agora.\n\nOn Tue, 22 Sep wrote:\n> mensagem antiga",
    });
    expect(result).toBe("Sim, estamos avaliando isso agora.");
  });

  it("sanitizes HTML when plain text is unavailable", () => {
    const result = sanitizeProspectorInboundText({
      html: "<p>Podemos conversar na próxima semana.</p><script>alert(1)</script>",
    });
    expect(result).toContain("Podemos conversar na próxima semana.");
    expect(result).not.toContain("alert");
  });

  it("detects explicit opt-out phrases without treating ordinary objections as opt-out", () => {
    expect(isProspectorOptOut("Não tenho interesse, obrigado.")).toBe(true);
    expect(isProspectorOptOut("Pare de enviar mensagens")).toBe(true);
    expect(isProspectorOptOut("Agora não é prioridade, fale comigo mês que vem")).toBe(false);
  });
});
