/**
 * ATR-01: pure agreement selection. No database writes, UI visibility or payout effects.
 * An event snapshots the selected agreement/version/category at booking time.
 */
export type AtrOriginAgreement = {
  id: string;
  originTenantId: string;
  originPartnerId: string | null;
  version: number;
  status: "draft" | "active" | "suspended" | "retired";
  effectiveFrom: string;
  effectiveUntil: string | null;
};
export type AtrCategoryParticipation = {
  agreementId: string;
  categoryCode: string;
  sharePercent: string | number;
  enabled: boolean;
};
export type AtrResolution = {
  agreementId: string;
  agreementVersion: number;
  categoryCode: string;
  sharePercent: number;
  basis: "platform_net_commission_received";
};

/** Only an agreement whose origin matches and is active at the transaction date is eligible. */
export function resolveAtrOriginParticipation(input: {
  originTenantId: string;
  originPartnerId?: string | null;
  categoryCode: string;
  occurredAt: Date;
  agreements: AtrOriginAgreement[];
  categories: AtrCategoryParticipation[];
}): AtrResolution | null {
  const now = input.occurredAt.getTime();
  if (!Number.isFinite(now) || !input.categoryCode.trim()) return null;
  const matching = input.agreements
    .filter((agreement) =>
      agreement.originTenantId === input.originTenantId &&
      agreement.status === "active" &&
      (agreement.originPartnerId === null || agreement.originPartnerId === (input.originPartnerId ?? null)) &&
      Number.isFinite(Date.parse(agreement.effectiveFrom)) &&
      Date.parse(agreement.effectiveFrom) <= now &&
      (agreement.effectiveUntil === null || (Number.isFinite(Date.parse(agreement.effectiveUntil)) && now < Date.parse(agreement.effectiveUntil)))
    )
    .sort((a, b) =>
      Number(b.originPartnerId !== null) - Number(a.originPartnerId !== null) ||
      Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) ||
      b.version - a.version ||
      a.id.localeCompare(b.id)
    );
  for (const agreement of matching) {
    const category = input.categories.find((item) =>
      item.agreementId === agreement.id && item.categoryCode === input.categoryCode
    );
    if (!category) continue;
    // Explicit disabling takes precedence over any fallback agreement.
    if (!category.enabled) return null;
    const pct = Number(category.sharePercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    return { agreementId: agreement.id, agreementVersion: agreement.version,
      categoryCode: category.categoryCode, sharePercent: pct,
      basis: "platform_net_commission_received" };
  }
  return null;
}
/**
 * Input must be the net Vendor.ai commission actually reconciled and received,
 * not order gross, seller commission, or a provisional event amount.
 * Uses integer cents to avoid floating-point currency accumulation.
 */
export function calculateAtrOriginShareCents(platformNetReceivedCents: number, sharePercent: number): number {
  if (!Number.isSafeInteger(platformNetReceivedCents) || platformNetReceivedCents < 0 ||
      !Number.isFinite(sharePercent) || sharePercent < 0 || sharePercent > 100) {
    throw new RangeError("Invalid ATR commission basis or percent");
  }
  return Math.round(platformNetReceivedCents * sharePercent / 100);
}
