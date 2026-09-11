import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_EXPO_BATCH = 100;

export type MobilePlatform = "android" | "ios" | "unknown";

type DeviceRow = {
  expo_push_token: string;
};

type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

function isExpoPushToken(value: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(value);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function registerVisitorPushDevice(input: {
  tenantId: string;
  userId: string;
  expoPushToken: string;
  platform?: MobilePlatform;
}) {
  const token = input.expoPushToken.trim();
  if (!isExpoPushToken(token)) throw new Error("Expo push token inválido");

  await db.execute(sql`
    INSERT INTO mobile_push_devices (
      tenant_id, user_id, expo_push_token, platform, active, created_at, updated_at, last_seen_at
    ) VALUES (
      ${input.tenantId}::uuid,
      ${input.userId}::uuid,
      ${token},
      ${input.platform ?? "unknown"},
      true,
      now(),
      now(),
      now()
    )
    ON CONFLICT (expo_push_token) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      active = true,
      updated_at = now(),
      last_seen_at = now()
  `);

  return { registered: true };
}

export async function unregisterVisitorPushDevice(input: {
  tenantId: string;
  userId: string;
  expoPushToken: string;
}) {
  await db.execute(sql`
    UPDATE mobile_push_devices
       SET active = false, updated_at = now()
     WHERE tenant_id = ${input.tenantId}::uuid
       AND user_id = ${input.userId}::uuid
       AND expo_push_token = ${input.expoPushToken.trim()}
  `);
  return { registered: false };
}

async function releaseClaim(tenantId: string, sessionId: string) {
  await db.execute(sql`
    DELETE FROM visitor_push_alerts
     WHERE tenant_id = ${tenantId}::uuid
       AND anonymous_session_id = ${sessionId}
       AND kind = 'visitor_online'
       AND delivered_at IS NULL
  `).catch(() => {});
}

async function deactivateToken(token: string) {
  await db.execute(sql`
    UPDATE mobile_push_devices
       SET active = false, updated_at = now()
     WHERE expo_push_token = ${token}
  `).catch(() => {});
}

/**
 * Envia um único push por sessão pública. O lock durável no banco impede que
 * os heartbeats de presença gerem notificações repetidas. O texto é genérico
 * para não expor PII na tela bloqueada; os detalhes ficam disponíveis somente
 * depois de abrir o VendorAI autenticado.
 */
export async function notifyVisitorOnline(input: { tenantId: string; sessionId: string }) {
  const claim = await db.execute<{ id: string }>(sql`
    INSERT INTO visitor_push_alerts (tenant_id, anonymous_session_id, kind)
    VALUES (${input.tenantId}::uuid, ${input.sessionId}, 'visitor_online')
    ON CONFLICT (tenant_id, anonymous_session_id, kind) DO NOTHING
    RETURNING id
  `);

  if (claim.rows.length === 0) return { deduplicated: true, sent: 0 };

  const devices = await db.execute<DeviceRow>(sql`
    SELECT expo_push_token
      FROM mobile_push_devices
     WHERE tenant_id = ${input.tenantId}::uuid
       AND active = true
  `);

  if (devices.rows.length === 0) {
    await releaseClaim(input.tenantId, input.sessionId);
    return { deduplicated: false, sent: 0 };
  }

  const targetUrl = `https://app.appvendorai.com/content?tab=campanhas&view=visitantes&session=${encodeURIComponent(input.sessionId)}`;
  let sent = 0;

  try {
    for (const group of chunks(devices.rows, MAX_EXPO_BATCH)) {
      const messages = group.map((device) => ({
        to: device.expo_push_token,
        sound: "default",
        title: "Novo visitante online",
        body: "Há uma nova sessão ativa no seu site.",
        channelId: "visitor-intelligence",
        priority: "high",
        data: {
          type: "visitor_online",
          sessionId: input.sessionId,
          url: targetUrl,
        },
      }));

      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        throw new Error(`Expo push respondeu HTTP ${response.status}`);
      }

      const payload = await response.json() as { data?: ExpoTicket[] };
      const tickets = Array.isArray(payload.data) ? payload.data : [];

      for (let i = 0; i < group.length; i += 1) {
        const ticket = tickets[i];
        const token = group[i]?.expo_push_token;
        if (!token) continue;
        if (ticket?.status === "ok") sent += 1;
        if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          void deactivateToken(token);
        }
      }
    }

    await db.execute(sql`
      UPDATE visitor_push_alerts
         SET delivered_at = now()
       WHERE tenant_id = ${input.tenantId}::uuid
         AND anonymous_session_id = ${input.sessionId}
         AND kind = 'visitor_online'
    `);

    return { deduplicated: false, sent };
  } catch (error) {
    await releaseClaim(input.tenantId, input.sessionId);
    throw error;
  }
}
