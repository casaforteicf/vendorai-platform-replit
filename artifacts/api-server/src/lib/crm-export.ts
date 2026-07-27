import type { Logger } from "pino";
import { db, leadsTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface CRMEventPayload {
  event: "lead_qualified" | "deal_won" | "lead_created";
  tenantId: string;
  lead: {
    id: string;
    nome: string | null;
    empresa: string | null;
    telefone: string | null;
    email: string | null;
    source: string | null;
    status: string;
    createdAt: Date;
  };
  timestamp: string;
}

async function postToCRM(
  url: string,
  apiKey: string | undefined,
  payload: CRMEventPayload,
  log: Logger
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CRM webhook responded ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function exportLeadToCRM(params: {
  tenantId: string;
  leadId: string;
  event: CRMEventPayload["event"];
  log: Logger;
}): Promise<void> {
  const crmUrl = process.env.CRM_WEBHOOK_URL;
  if (!crmUrl) return;

  const { tenantId, leadId, event, log } = params;
  const crmApiKey = process.env.CRM_API_KEY;

  try {
    const [lead] = await db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        email: leadsTable.email,
        source: leadsTable.source,
        status: leadsTable.status,
        createdAt: leadsTable.createdAt,
      })
      .from(leadsTable)
      .where(eq(leadsTable.id, leadId));

    if (!lead) {
      log.warn({ tenantId, leadId }, "crm-export: lead not found");
      return;
    }

    const payload: CRMEventPayload = {
      event,
      tenantId,
      lead: {
        id: lead.id,
        nome: lead.nome ?? null,
        empresa: lead.empresa ?? null,
        telefone: lead.telefone ?? null,
        email: lead.email ?? null,
        source: lead.source ?? null,
        status: lead.status,
        createdAt: lead.createdAt,
      },
      timestamp: new Date().toISOString(),
    };

    await postToCRM(crmUrl, crmApiKey, payload, log);
    log.info({ tenantId, leadId, event }, "crm-export: lead exported");
  } catch (err) {
    log.warn({ err, tenantId, leadId, event }, "crm-export: failed (non-fatal)");
  }
}

export async function exportBatchToCRM(params: {
  tenantId: string;
  leadIds: string[];
  event: CRMEventPayload["event"];
  log: Logger;
}): Promise<void> {
  const crmUrl = process.env.CRM_WEBHOOK_URL;
  if (!crmUrl) return;
  const { leadIds, log } = params;
  log.info({ count: leadIds.length }, "crm-export: starting batch export");
  for (const leadId of leadIds) {
    await exportLeadToCRM({ ...params, leadId });
  }
}
