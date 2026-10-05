import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("email omnichannel implementation", () => {
  it("routes manual outgoing email through the real omnichannel dispatcher", () => {
    const messages = source("../routes/messages.ts");
    const omnichannel = source("../services/omnichannel.ts");

    expect(messages).toContain('canal === "email"');
    expect(messages).toContain("sendOutgoingMessage(");
    expect(messages).toContain("emailSubject:");
    expect(omnichannel).toContain('if (canal === "email")');
    expect(omnichannel).toContain("sendConnectedEmail({");
    expect(omnichannel).toContain("new Resend(apiKey)");
  });

  it("keeps unmatched inbound email outside the CRM pipeline and starts automatic sync", () => {
    const platforms = source("../services/email-platforms.ts");
    const worker = source("../services/email-inbox-worker.ts");
    const conversations = source("../../../frontend/src/pages/Conversations.tsx");

    expect(platforms).toContain('category: "email_unmatched"');
    expect(platforms).toContain('status: "unmatched" as const');
    expect(platforms).not.toContain('source: "email_unmatched"');
    expect(worker).toContain("const POLL_MS = 5 * 60 * 1000");
    expect(worker).toContain("syncConnectedEmailInbox(");
    expect(conversations).toContain('"unmatched"');
    expect(conversations).toContain("E-mails não classificados");
  });

  it("guards every tenant email integration route before tenant-scoped work", () => {
    const routes = source("../routes/email-integrations.ts");
    const guardedAssignments = routes.match(/tenant-audit: reviewed guarded immediately by authenticated same-tenant\/super-admin access/g) ?? [];

    expect(guardedAssignments).toHaveLength(7);
    expect(routes).toContain("if (!canAccess(req, tenantId))");
    expect(routes).toContain('consumeOAuthState(state, stateProvider(selected))');
  });
});
