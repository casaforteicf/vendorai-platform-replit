import { createHmac } from "node:crypto";
import { vendorPool } from "../lib/vendorDb";

export type ShieldDecision = "approve" | "require_3ds" | "review" | "block";
export type ShieldRiskLevel = "low" | "medium" | "high" | "critical";

export interface ShieldSignals {
  customerId?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  deviceId?: string | null;
  ip?: string | null;
  cardFingerprint?: string | null;
  amountCentavos: number;
  billingType?: string | null;
  accountAgeDays?: number | null;
  successfulOrders?: number | null;
  previousChargebacks?: number | null;
  previousFraud?: number | null;
  addressMismatch?: boolean;
  geolocationMismatch?: boolean;
  proxyOrVpn?: boolean;
  threeDsAvailable?: boolean;
  threeDsAuthenticated?: boolean;
  vendorAgeDays?: number | null;
  vendorChargebackRateBps?: number | null;
  manualFlags?: string[];
}

export interface ShieldAssessmentResult {
  id?: string;
  score: number;
  riskLevel: ShieldRiskLevel;
  decision: ShieldDecision;
  reserveBps: number;
  require3ds: boolean;
  reasons: string[];
  velocity: {
    attempts10m: number;
    cards24h: number;
    accounts24h: number;
  };
  hashes: {
    documentHash: string | null;
    emailHash: string | null;
    phoneHash: string | null;
    deviceHash: string | null;
    ipHash: string | null;
  };
}

type ShieldConfig = {
  enabled: boolean;
  reviewThreshold: number;
  blockThreshold: number;
  require3dsThreshold: number;
  highValueCentavos: number;
  newVendorReserveBps: number;
  mediumRiskReserveBps: number;
  highRiskReserveBps: number;
  velocityMaxAttempts10m: number;
  velocityMaxCards24h: number;
  velocityMaxAccounts24h: number;
};

const DEFAULT_CONFIG: ShieldConfig = {
  enabled: true,
  reviewThreshold: 61,
  blockThreshold: 81,
  require3dsThreshold: 31,
  highValueCentavos: 300_000,
  newVendorReserveBps: 1000,
  mediumRiskReserveBps: 500,
  highRiskReserveBps: 1500,
  velocityMaxAttempts10m: 5,
  velocityMaxCards24h: 3,
  velocityMaxAccounts24h: 3,
};

function normalize(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  return v || null;
}

export function shieldHash(value: string | null | undefined): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  const secret = String(process.env["VENDOR_SHIELD_HASH_SECRET"] || process.env["JWT_SECRET"] || "");
  if (!secret) throw new Error("VENDOR_SHIELD_HASH_SECRET (ou JWT_SECRET) não configurado.");
  return createHmac("sha256", secret).update(normalized).digest("hex");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function getConfig(tenantId: string): Promise<ShieldConfig> {
  const result = await vendorPool.query(
    `SELECT enabled,
            review_threshold AS "reviewThreshold",
            block_threshold AS "blockThreshold",
            require_3ds_threshold AS "require3dsThreshold",
            high_value_centavos AS "highValueCentavos",
            new_vendor_reserve_bps AS "newVendorReserveBps",
            medium_risk_reserve_bps AS "mediumRiskReserveBps",
            high_risk_reserve_bps AS "highRiskReserveBps",
            velocity_max_attempts_10m AS "velocityMaxAttempts10m",
            velocity_max_cards_24h AS "velocityMaxCards24h",
            velocity_max_accounts_24h AS "velocityMaxAccounts24h"
       FROM vendor_shield_configs WHERE tenant_id=$1`,
    [tenantId],
  );
  if (!result.rowCount) return DEFAULT_CONFIG;
  const row = result.rows[0];
  return {
    enabled: Boolean(row.enabled),
    reviewThreshold: Number(row.reviewThreshold),
    blockThreshold: Number(row.blockThreshold),
    require3dsThreshold: Number(row.require3dsThreshold),
    highValueCentavos: Number(row.highValueCentavos),
    newVendorReserveBps: Number(row.newVendorReserveBps),
    mediumRiskReserveBps: Number(row.mediumRiskReserveBps),
    highRiskReserveBps: Number(row.highRiskReserveBps),
    velocityMaxAttempts10m: Number(row.velocityMaxAttempts10m),
    velocityMaxCards24h: Number(row.velocityMaxCards24h),
    velocityMaxAccounts24h: Number(row.velocityMaxAccounts24h),
  };
}

async function getVelocity(
  tenantId: string,
  hashes: { deviceHash: string | null; ipHash: string | null; documentHash: string | null },
) {
  const result = await vendorPool.query(
    `SELECT
       count(*) FILTER (WHERE occurred_at >= now()-interval '10 minutes' AND event_type='payment_attempt')::int AS "attempts10m",
       count(DISTINCT card_fingerprint) FILTER (WHERE occurred_at >= now()-interval '24 hours' AND card_fingerprint IS NOT NULL)::int AS "cards24h",
       count(DISTINCT document_hash) FILTER (WHERE occurred_at >= now()-interval '24 hours' AND document_hash IS NOT NULL)::int AS "accounts24h"
     FROM vendor_shield_velocity_events
     WHERE tenant_id=$1
       AND occurred_at >= now()-interval '24 hours'
       AND (($2::text IS NOT NULL AND device_hash=$2)
         OR ($3::text IS NOT NULL AND ip_hash=$3)
         OR ($4::text IS NOT NULL AND document_hash=$4))`,
    [tenantId, hashes.deviceHash, hashes.ipHash, hashes.documentHash],
  );
  return {
    attempts10m: Number(result.rows[0]?.attempts10m ?? 0),
    cards24h: Number(result.rows[0]?.cards24h ?? 0),
    accounts24h: Number(result.rows[0]?.accounts24h ?? 0),
  };
}

export async function assessVendorShieldRisk(
  tenantId: string,
  orderId: string | null,
  signals: ShieldSignals,
  options: { phase?: string; persist?: boolean } = {},
): Promise<ShieldAssessmentResult> {
  if (!Number.isSafeInteger(signals.amountCentavos) || signals.amountCentavos < 0) {
    throw new Error("amountCentavos inválido para avaliação de risco.");
  }

  const config = await getConfig(tenantId);
  const hashes = {
    documentHash: shieldHash(signals.document?.replace(/\D/g, "")),
    emailHash: shieldHash(signals.email),
    phoneHash: shieldHash(signals.phone?.replace(/\D/g, "")),
    deviceHash: shieldHash(signals.deviceId),
    ipHash: shieldHash(signals.ip),
  };
  const velocity = await getVelocity(tenantId, hashes);
  const reasons: string[] = [];
  let score = 0;

  if (!signals.document) { score += 12; reasons.push("document_missing"); }
  if (!signals.email) { score += 5; reasons.push("email_missing"); }
  if (!signals.phone) { score += 5; reasons.push("phone_missing"); }
  if (!signals.deviceId) { score += 8; reasons.push("device_unidentified"); }

  if (signals.accountAgeDays != null && signals.accountAgeDays < 2) {
    score += 12; reasons.push("new_account");
  } else if (signals.accountAgeDays != null && signals.accountAgeDays >= 90) {
    score -= 6; reasons.push("established_account");
  }

  if ((signals.successfulOrders ?? 0) >= 5) {
    score -= Math.min(12, Math.floor(Number(signals.successfulOrders) / 5) * 2);
    reasons.push("positive_purchase_history");
  }
  if ((signals.previousChargebacks ?? 0) > 0) {
    score += Math.min(35, Number(signals.previousChargebacks) * 15);
    reasons.push("previous_chargeback");
  }
  if ((signals.previousFraud ?? 0) > 0) {
    score += 45; reasons.push("previous_fraud");
  }
  if (signals.addressMismatch) { score += 10; reasons.push("address_mismatch"); }
  if (signals.geolocationMismatch) { score += 10; reasons.push("geolocation_mismatch"); }
  if (signals.proxyOrVpn) { score += 8; reasons.push("proxy_or_vpn"); }
  if (signals.amountCentavos >= config.highValueCentavos) {
    score += 10; reasons.push("high_value");
  }
  if (velocity.attempts10m >= config.velocityMaxAttempts10m) {
    score += 25; reasons.push("velocity_attempts_10m");
  }
  if (velocity.cards24h >= config.velocityMaxCards24h) {
    score += 25; reasons.push("multiple_cards_24h");
  }
  if (velocity.accounts24h >= config.velocityMaxAccounts24h) {
    score += 20; reasons.push("multiple_accounts_24h");
  }
  if ((signals.vendorChargebackRateBps ?? 0) >= 100) {
    score += 12; reasons.push("vendor_chargeback_rate_high");
  }
  if ((signals.vendorAgeDays ?? 9999) < 30) {
    score += 8; reasons.push("new_vendor");
  }
  if (signals.threeDsAuthenticated) {
    score -= 15; reasons.push("3ds_authenticated");
  }
  if (Array.isArray(signals.manualFlags) && signals.manualFlags.length) {
    score += Math.min(30, signals.manualFlags.length * 10);
    reasons.push(...signals.manualFlags.map((f) => `manual:${String(f).slice(0, 80)}`));
  }

  score = clamp(Math.round(score), 0, 100);

  let decision: ShieldDecision = "approve";
  let riskLevel: ShieldRiskLevel = "low";
  if (!config.enabled) {
    reasons.push("shield_disabled_for_tenant");
  } else if (score >= config.blockThreshold) {
    decision = "block";
    riskLevel = "critical";
  } else if (score >= config.reviewThreshold) {
    decision = "review";
    riskLevel = "high";
  } else if (score >= config.require3dsThreshold && signals.billingType === "CREDIT_CARD") {
    decision = "require_3ds";
    riskLevel = "medium";
  } else if (score >= config.require3dsThreshold) {
    riskLevel = "medium";
  }

  let reserveBps = 0;
  if ((signals.vendorAgeDays ?? 9999) < 30) reserveBps = Math.max(reserveBps, config.newVendorReserveBps);
  if (riskLevel === "medium") reserveBps = Math.max(reserveBps, config.mediumRiskReserveBps);
  if (riskLevel === "high" || riskLevel === "critical") reserveBps = Math.max(reserveBps, config.highRiskReserveBps);

  const result: ShieldAssessmentResult = {
    score, riskLevel, decision, reserveBps,
    require3ds: decision === "require_3ds" || (signals.billingType === "CREDIT_CARD" && score >= config.require3dsThreshold),
    reasons: [...new Set(reasons)], velocity, hashes,
  };

  if (options.persist !== false) {
    const inserted = await vendorPool.query(
      `INSERT INTO vendor_shield_assessments
        (tenant_id,order_id,phase,score,risk_level,decision,reserve_bps,require_3ds,reasons,signals,model_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'rules-v1')
       RETURNING id`,
      [tenantId, orderId, options.phase ?? "pre_payment", score, riskLevel, decision, reserveBps,
       result.require3ds, JSON.stringify(result.reasons), JSON.stringify({
         amountCentavos: signals.amountCentavos,
         billingType: signals.billingType ?? null,
         accountAgeDays: signals.accountAgeDays ?? null,
         successfulOrders: signals.successfulOrders ?? null,
         previousChargebacks: signals.previousChargebacks ?? null,
         previousFraud: signals.previousFraud ?? null,
         addressMismatch: Boolean(signals.addressMismatch),
         geolocationMismatch: Boolean(signals.geolocationMismatch),
         proxyOrVpn: Boolean(signals.proxyOrVpn),
         threeDsAvailable: Boolean(signals.threeDsAvailable),
         threeDsAuthenticated: Boolean(signals.threeDsAuthenticated),
         vendorAgeDays: signals.vendorAgeDays ?? null,
         vendorChargebackRateBps: signals.vendorChargebackRateBps ?? null,
         velocity,
         hashes,
       })],
    );
    result.id = inserted.rows[0].id;
    await vendorPool.query(
      `INSERT INTO vendor_shield_audit_events (tenant_id,order_id,assessment_id,event_type,metadata)
       VALUES ($1,$2,$3,'risk_assessed',$4::jsonb)`,
      [tenantId, orderId, result.id, JSON.stringify({ score, riskLevel, decision, reserveBps })],
    );
  }

  return result;
}

export async function recordShieldVelocityEvent(args: {
  tenantId: string;
  orderId?: string | null;
  eventType: "checkout" | "payment_attempt" | "payment_authorized" | "payment_failed" | "refund" | "chargeback" | "account_created";
  deviceId?: string | null;
  ip?: string | null;
  document?: string | null;
  cardFingerprint?: string | null;
  amountCentavos?: number | null;
  metadata?: Record<string, unknown>;
}) {
  await vendorPool.query(
    `INSERT INTO vendor_shield_velocity_events
      (tenant_id,order_id,event_type,device_hash,ip_hash,document_hash,card_fingerprint,amount_centavos,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [args.tenantId, args.orderId ?? null, args.eventType, shieldHash(args.deviceId), shieldHash(args.ip),
     shieldHash(args.document?.replace(/\D/g, "")), args.cardFingerprint ? shieldHash(args.cardFingerprint) : null,
     args.amountCentavos ?? null, JSON.stringify(args.metadata ?? {})],
  );
}
