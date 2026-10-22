import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import {
  getMetaAdsConnectionByTenantId,
  META_GRAPH_BASE,
  normalizeMetaAdAccountId,
  refreshMetaAdsToken,
} from "./meta-ads-oauth.js";

export type MetaCustomAudienceKey =
  | "meta_engaged_30d"
  | "meta_hot_intent_30d"
  | "instagram_dm_30d"
  | "instagram_comments_30d";

const AUDIENCES: Record<MetaCustomAudienceKey, { label: string; description: string }> = {
  meta_engaged_30d: {
    label: "VendorAI · Engajados Meta 30d",
    description: "Leads consentidos que engajaram com Instagram/Meta nos últimos 30 dias.",
  },
  meta_hot_intent_30d: {
    label: "VendorAI · Alta intenção Meta 30d",
    description: "Leads consentidos com sinal forte de intenção vindo da Meta nos últimos 30 dias.",
  },
  instagram_dm_30d: {
    label: "VendorAI · DMs Instagram 30d",
    description: "Leads consentidos que enviaram DM no Instagram nos últimos 30 dias.",
  },
  instagram_comments_30d: {
    label: "VendorAI · Comentários Instagram 30d",
    description: "Leads consentidos que comentaram no Instagram nos últimos 30 dias.",
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasAdDataConsent(discoveryData: unknown, metadata: unknown): boolean {
  const discovery = asRecord(discoveryData);
  const attribution = asRecord(discovery["attribution"]);
  const consent = asRecord(attribution["adDataConsent"]);
  const meta = asRecord(metadata);
  return consent["granted"] === true || attribution["adDataConsent"] === true || meta["adDataConsent"] === true;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function normalizePhone(value: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  // Customer-list matching precisa de DDI. Não inferimos país para número local.
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
}

function matchesAudience(key: MetaCustomAudienceKey, metaEngagement: Record<string, unknown>): boolean {
  const untilRaw = metaEngagement["remarketingEligibleUntil"];
  const until = typeof untilRaw === "string" ? Date.parse(untilRaw) : Number.NaN;
  if (!Number.isFinite(until) || until < Date.now()) return false;

  if (key === "meta_hot_intent_30d") return metaEngagement["hotIntent"] === true;
  if (key === "instagram_dm_30d") return metaEngagement["lastEventType"] === "dm";
  if (key === "instagram_comments_30d") return metaEngagement["lastEventType"] === "comment";
  return true;
}

async function getActiveConnection(tenantId: string) {
  let conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.accessToken || !conn.adAccountId) {
    throw new Error("Meta Ads precisa estar conectado antes de sincronizar audiências.");
  }

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (expiresAt && expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(conn.id);
    conn = await getMetaAdsConnectionByTenantId(tenantId);
  }
  if (!conn?.accessToken || !conn.adAccountId || conn.status !== "active") {
    throw new Error("Não foi possível obter uma conexão Meta Ads ativa.");
  }
  return { ...conn, accessToken: conn.accessToken, adAccountId: conn.adAccountId };
}

async function metaPost(path: string, accessToken: string, params: Record<string, string>) {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as { error?: { error_user_msg?: string; message?: string } };
      message = parsed.error?.error_user_msg || parsed.error?.message || message;
    } catch {}
    throw new Error(message || `Meta API error ${response.status}`);
  }
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

async function loadEligibleIdentifiers(tenantId: string, key: MetaCustomAudienceKey) {
  const leads = await db
    .select({
      id: leadsTable.id,
      email: leadsTable.email,
      telefone: leadsTable.telefone,
      discoveryData: leadsTable.discoveryData,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      isNull(leadsTable.excluidoEm),
      isNull(leadsTable.naoLeadTipo),
    ));

  const memberRows = new Map<string, [string, string]>();
  let consented = 0;
  let audienceMatched = 0;

  for (const lead of leads) {
    if (!hasAdDataConsent(lead.discoveryData, lead.metadata)) continue;
    consented += 1;
    const discovery = asRecord(lead.discoveryData);
    const metaEngagement = asRecord(discovery["metaEngagement"]);
    if (!matchesAudience(key, metaEngagement)) continue;
    audienceMatched += 1;

    const email = normalizeEmail(lead.email);
    const phone = normalizePhone(lead.telefone);
    const emailHash = email ? sha256(email) : "";
    const phoneHash = phone ? sha256(phone) : "";
    if (!emailHash && !phoneHash) continue;
    memberRows.set(`${emailHash}|${phoneHash}`, [emailHash, phoneHash]);
  }

  const rows = [...memberRows.values()];
  return {
    consented,
    audienceMatched,
    rows,
    matchableContacts: rows.length,
    matchableIdentifiers: rows.reduce((total, [email, phone]) => total + (email ? 1 : 0) + (phone ? 1 : 0), 0),
  };
}

type StoredAudienceRow = {
  external_audience_id: string | null;
  status: string;
  synced_count: number;
  eligible_count: number;
  last_error: string | null;
  last_synced_at: Date | null;
};

async function getStoredAudience(tenantId: string, key: MetaCustomAudienceKey): Promise<StoredAudienceRow | null> {
  const result = await db.execute(sql`
    SELECT external_audience_id, status, synced_count, eligible_count, last_error, last_synced_at
      FROM meta_custom_audiences
     WHERE tenant_id = ${tenantId}
       AND audience_key = ${key}
     LIMIT 1
  `);
  return (result.rows?.[0] as StoredAudienceRow | undefined) ?? null;
}

async function persistAudience(input: {
  tenantId: string;
  key: MetaCustomAudienceKey;
  externalAudienceId: string | null;
  status: string;
  eligibleCount: number;
  syncedCount: number;
  lastError: string | null;
  syncedAt?: Date | null;
}) {
  const label = AUDIENCES[input.key].label;
  await db.execute(sql`
    INSERT INTO meta_custom_audiences (
      tenant_id, audience_key, label, external_audience_id, status,
      eligible_count, synced_count, last_error, last_synced_at, updated_at
    ) VALUES (
      ${input.tenantId}, ${input.key}, ${label}, ${input.externalAudienceId}, ${input.status},
      ${input.eligibleCount}, ${input.syncedCount}, ${input.lastError}, ${input.syncedAt ?? null}, NOW()
    )
    ON CONFLICT (tenant_id, audience_key) DO UPDATE SET
      label = EXCLUDED.label,
      external_audience_id = EXCLUDED.external_audience_id,
      status = EXCLUDED.status,
      eligible_count = EXCLUDED.eligible_count,
      synced_count = EXCLUDED.synced_count,
      last_error = EXCLUDED.last_error,
      last_synced_at = EXCLUDED.last_synced_at,
      updated_at = NOW()
  `);
}

async function ensureExternalAudience(tenantId: string, key: MetaCustomAudienceKey) {
  const stored = await getStoredAudience(tenantId, key);
  if (stored?.external_audience_id) return stored.external_audience_id;

  const conn = await getActiveConnection(tenantId);
  const config = AUDIENCES[key];
  const created = await metaPost(`${normalizeMetaAdAccountId(conn.adAccountId)}/customaudiences`, conn.accessToken, {
    name: config.label,
    subtype: "CUSTOM",
    customer_file_source: "USER_PROVIDED_ONLY",
    description: config.description,
  });
  const id = typeof created.id === "string" ? created.id : null;
  if (!id) throw new Error("A Meta não retornou o ID da Custom Audience criada.");
  return id;
}

async function replaceAudienceMembership(
  audienceId: string,
  accessToken: string,
  rows: Array<[string, string]>,
) {
  const chunkSize = 1000;
  const sessionId = Date.now();
  const totalBatches = Math.max(1, Math.ceil(rows.length / chunkSize));

  for (let batchSeq = 0; batchSeq < totalBatches; batchSeq += 1) {
    const start = batchSeq * chunkSize;
    const chunk = rows.slice(start, start + chunkSize);
    const isLastBatch = batchSeq === totalBatches - 1;
    await metaPost(`${audienceId}/usersreplace`, accessToken, {
      payload: JSON.stringify({
        schema: ["EMAIL", "PHONE"],
        data: chunk,
      }),
      session: JSON.stringify({
        session_id: sessionId,
        batch_seq: batchSeq,
        last_batch_flag: isLastBatch,
        estimated_num_total: rows.length,
      }),
    });
  }

  return rows.reduce((total, [email, phone]) => total + (email ? 1 : 0) + (phone ? 1 : 0), 0);
}

type AudienceListRow = {
  audience_key: MetaCustomAudienceKey;
  label: string;
  external_audience_id: string | null;
  status: string;
  eligible_count: number;
  synced_count: number;
  last_error: string | null;
  last_synced_at: Date | null;
};

export async function listMetaCustomAudiences(tenantId: string) {
  const result = await db.execute(sql`
    SELECT audience_key, label, external_audience_id, status, eligible_count, synced_count, last_error, last_synced_at
      FROM meta_custom_audiences
     WHERE tenant_id = ${tenantId}
     ORDER BY created_at ASC
  `);

  return {
    audiences: (result.rows ?? []) as AudienceListRow[],
    supportedKeys: Object.entries(AUDIENCES).map(([key, value]) => ({ key, label: value.label })),
  };
}

export async function syncMetaCustomAudience(tenantId: string, key: MetaCustomAudienceKey) {
  if (!(key in AUDIENCES)) throw new Error("Audiência Meta não suportada.");

  const identifiers = await loadEligibleIdentifiers(tenantId, key);
  const conn = await getActiveConnection(tenantId);
  let externalAudienceId: string | null = null;
  try {
    externalAudienceId = await ensureExternalAudience(tenantId, key);
    const uploaded = await replaceAudienceMembership(externalAudienceId, conn.accessToken, identifiers.rows);

    const status = identifiers.matchableContacts === 0 ? "reconciled_empty" : "synced";
    await persistAudience({
      tenantId,
      key,
      externalAudienceId,
      status,
      eligibleCount: identifiers.audienceMatched,
      syncedCount: uploaded,
      lastError: null,
      syncedAt: new Date(),
    });

    return {
      key,
      status,
      externalAudienceId,
      eligibleLeads: identifiers.audienceMatched,
      consentedLeads: identifiers.consented,
      matchableContacts: identifiers.matchableContacts,
      uploadedIdentifiers: uploaded,
      membershipReconciled: true,
      removedStaleMemberships: true,
      campaignActivated: false,
      spendActivated: false,
      message: identifiers.matchableContacts === 0
        ? "A lista externa foi reconciliada sem contatos elegíveis; consentimentos revogados ou expirados não permanecem na audiência sincronizada."
        : "A lista externa foi substituída pela audiência consentida atual; membros revogados, expirados ou inelegíveis deixam de permanecer na Customer List.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao reconciliar Custom Audience.";
    await persistAudience({
      tenantId,
      key,
      externalAudienceId,
      status: "error",
      eligibleCount: identifiers.audienceMatched,
      syncedCount: 0,
      lastError: message.slice(0, 1000),
    });
    throw new Error(message);
  }
}
