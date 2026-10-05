import { and, eq, isNull, or } from "drizzle-orm";
import type { Logger } from "pino";
import { db, socialConnectionsTable } from "@workspace/db";
import { syncConnectedEmailInbox, type EmailProvider } from "./email-platforms.js";
import { dispatchAgentBackground } from "./agent-dispatch.js";

const POLL_MS = 5 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function runEmailInboxSync(log: Logger) {
  if (running) return;
  running = true;
  try {
    const connections = await db.select({
      tenantId: socialConnectionsTable.tenantId,
      provider: socialConnectionsTable.provider,
    }).from(socialConnectionsTable).where(and(
      eq(socialConnectionsTable.status, "active"),
      isNull(socialConnectionsTable.disconnectedAt),
      or(
        eq(socialConnectionsTable.provider, "email_google"),
        eq(socialConnectionsTable.provider, "email_microsoft"),
        eq(socialConnectionsTable.provider, "email_webmail"),
      ),
    ));

    for (const connection of connections) {
      const provider: EmailProvider = connection.provider === "email_google" ? "google" : connection.provider === "email_microsoft" ? "microsoft" : "webmail";
      try {
        const result = await syncConnectedEmailInbox(connection.tenantId, provider);
        for (const item of result.results) {
          if (item.status !== "imported" || typeof item.leadId !== "string" || typeof item.mensagem !== "string") continue;
          dispatchAgentBackground({
            tenantId: connection.tenantId,
            leadId: item.leadId,
            mensagem: item.mensagem,
            log,
            scenario: {
              canal: "email",
              subject: typeof item.subject === "string" ? item.subject : "",
              externalId: typeof item.externalId === "string" ? item.externalId : "",
            },
          });
        }
        if (result.imported || result.unmatched) {
          log.info({
            tenantId: connection.tenantId,
            provider,
            imported: result.imported,
            unmatched: result.unmatched,
            duplicates: result.duplicates,
          }, "email-inbox-worker: sync concluído");
        }
      } catch (error) {
        log.warn({ error, tenantId: connection.tenantId, provider }, "email-inbox-worker: falha de sincronização");
      }
    }
  } finally {
    running = false;
  }
}

export function startEmailInboxWorker(log: Logger) {
  if (timer || process.env["NODE_ENV"] === "test") return;
  void runEmailInboxSync(log);
  timer = setInterval(() => { void runEmailInboxSync(log); }, POLL_MS);
  timer.unref?.();
  log.info({ pollMs: POLL_MS }, "email-inbox-worker: iniciado");
}
