import { pool } from "@workspace/db";

export const CONTENT_GENERATION_BASE_LIMIT = 200;
export const GENERATION_PACK_SIZE = 200;
// Pacote comercial unificado: R$ 499 adiciona créditos de IA e também amplia
// a franquia de gerações de conteúdo. O saldo financeiro é controlado pelo AI Gateway.
export const GENERATION_PACK_PRICE_BRL = 499;

const CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

type ConfigRow = {
  id: string;
  content_generations_this_month: number;
  content_generations_reset_at: Date | string | null;
  content_generation_extra_used: number;
};

export type ContentGenerationAllowance = {
  configId: string | null;
  baseUsed: number;
  baseLimit: number;
  baseRemaining: number;
  extraPurchased: number;
  extraUsed: number;
  extraRemaining: number;
  available: number;
  canPurchase: boolean;
  packSize: number;
  packPriceBrl: number;
};

function resetNeeded(resetAt: Date | string | null, now: Date) {
  if (!resetAt) return true;
  const value = resetAt instanceof Date ? resetAt : new Date(resetAt);
  return !Number.isFinite(value.getTime()) || now.getTime() - value.getTime() > CYCLE_MS;
}

async function paidPackCount(client: { query: Function }, tenantId: string): Promise<number> {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM token_purchases
      WHERE tenant_id = $1
        AND status = 'paid'
        AND valor = $2::numeric`,
    [tenantId, GENERATION_PACK_PRICE_BRL],
  );
  return Math.max(0, Number(result.rows?.[0]?.count ?? 0));
}

function summary(row: ConfigRow | null, packs: number): ContentGenerationAllowance {
  const baseUsed = Math.max(0, Number(row?.content_generations_this_month ?? 0));
  const extraUsed = Math.max(0, Number(row?.content_generation_extra_used ?? 0));
  const extraPurchased = Math.max(0, packs * GENERATION_PACK_SIZE);
  const baseRemaining = Math.max(0, CONTENT_GENERATION_BASE_LIMIT - baseUsed);
  const extraRemaining = Math.max(0, extraPurchased - extraUsed);
  const available = baseRemaining + extraRemaining;
  return {
    configId: row?.id ?? null,
    baseUsed,
    baseLimit: CONTENT_GENERATION_BASE_LIMIT,
    baseRemaining,
    extraPurchased,
    extraUsed,
    extraRemaining,
    available,
    canPurchase: available === 0,
    packSize: GENERATION_PACK_SIZE,
    packPriceBrl: GENERATION_PACK_PRICE_BRL,
  };
}

export async function getContentGenerationAllowance(tenantId: string): Promise<ContentGenerationAllowance> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ConfigRow>(
      `SELECT id,
              content_generations_this_month,
              content_generations_reset_at,
              content_generation_extra_used
         FROM agent_configs
        WHERE tenant_id = $1
        FOR UPDATE`,
      [tenantId],
    );
    let row = result.rows[0] ?? null;
    const now = new Date();
    if (row && resetNeeded(row.content_generations_reset_at, now)) {
      const reset = await client.query<ConfigRow>(
        `UPDATE agent_configs
            SET content_generations_this_month = 0,
                content_generations_reset_at = $2,
                updated_at = $2
          WHERE id = $1
        RETURNING id,
                  content_generations_this_month,
                  content_generations_reset_at,
                  content_generation_extra_used`,
        [row.id, now],
      );
      row = reset.rows[0] ?? row;
    }
    const packs = await paidPackCount(client, tenantId);
    await client.query("COMMIT");
    return summary(row, packs);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeContentGenerationCredit(
  tenantId: string,
): Promise<"base" | "extra" | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ConfigRow>(
      `SELECT id,
              content_generations_this_month,
              content_generations_reset_at,
              content_generation_extra_used
         FROM agent_configs
        WHERE tenant_id = $1
        FOR UPDATE`,
      [tenantId],
    );
    let row = result.rows[0] ?? null;
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    const now = new Date();
    if (resetNeeded(row.content_generations_reset_at, now)) {
      const reset = await client.query<ConfigRow>(
        `UPDATE agent_configs
            SET content_generations_this_month = 0,
                content_generations_reset_at = $2,
                updated_at = $2
          WHERE id = $1
        RETURNING id,
                  content_generations_this_month,
                  content_generations_reset_at,
                  content_generation_extra_used`,
        [row.id, now],
      );
      row = reset.rows[0] ?? row;
    }

    if (Number(row.content_generations_this_month) < CONTENT_GENERATION_BASE_LIMIT) {
      await client.query(
        `UPDATE agent_configs
            SET content_generations_this_month = content_generations_this_month + 1,
                updated_at = $2
          WHERE id = $1`,
        [row.id, now],
      );
      await client.query("COMMIT");
      return "base";
    }

    const packs = await paidPackCount(client, tenantId);
    const extraPurchased = packs * GENERATION_PACK_SIZE;
    if (Number(row.content_generation_extra_used) < extraPurchased) {
      await client.query(
        `UPDATE agent_configs
            SET content_generation_extra_used = content_generation_extra_used + 1,
                updated_at = $2
          WHERE id = $1`,
        [row.id, now],
      );
      await client.query("COMMIT");
      return "extra";
    }

    await client.query("ROLLBACK");
    return null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function refundContentGenerationCredit(
  tenantId: string,
  source: "base" | "extra",
): Promise<void> {
  const column = source === "base" ? "content_generations_this_month" : "content_generation_extra_used";
  await pool.query(
    `UPDATE agent_configs
        SET ${column} = GREATEST(0, ${column} - 1),
            updated_at = NOW()
      WHERE tenant_id = $1`,
    [tenantId],
  );
}
