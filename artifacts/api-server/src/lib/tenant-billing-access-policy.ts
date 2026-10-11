/**
 * Tenant-scoped billing access policy.
 * Pure, server-side policy; callers must validate the authenticated membership.
 * Does not mutate subscriptions or trigger external payments.
 */
export type BillingAccessState = "active" | "grace_no_ai" | "restricted";
export type TenantSubscriptionStatus = "trial" | "ativa" | "inadimplente" | "cancelada";
export type PrincipalContext = "tenant_member" | "external_customer" | "platform_admin";

export interface BillingAccessInput {
  context: PrincipalContext;
  subscriptionStatus: TenantSubscriptionStatus | null;
  /** Actual settled-payment entitlement, never inferred from checkout redirect. */
  paidThrough: Date | null;
  /** Timestamp of the first unpaid due date; stable across retries. */
  unpaidSince: Date | null;
  now: Date;
  /** Separately authenticated customer portal / marketplace authorization. */
  externalAccessAuthorized?: boolean;
}

export interface BillingAccessDecision {
  state: BillingAccessState;
  operationalTools: boolean;
  aiAllowed: boolean;
  billingPortal: boolean;
  graceEndsAt: Date | null;
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const VENDORAI_GRACE_DAYS = 15;

function validDate(value: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Does not grant a resource permission; merely imposes tenant billing constraints.
 * Tenant membership and module permission must be checked independently.
 */
export function resolveTenantBillingAccess(input: BillingAccessInput): BillingAccessDecision {
  if (!validDate(input.now)) throw new Error("Invalid access evaluation time");
  const restricted = (reason: string, graceEndsAt: Date | null = null): BillingAccessDecision =>
    ({ state: "restricted", operationalTools: false, aiAllowed: false, billingPortal: true, graceEndsAt, reason });

  // Customer portal access is a separate authorization domain, not a purchased seat.
  // No AI entitlement is granted through this billing policy.
  if (input.context === "external_customer") {
    return {
      state: input.externalAccessAuthorized ? "active" : "restricted",
      operationalTools: input.externalAccessAuthorized === true,
      aiAllowed: false,
      billingPortal: false,
      graceEndsAt: null,
      reason: input.externalAccessAuthorized ? "external_customer_authorized" : "external_customer_unauthorized",
    };
  }

  // Platform admins use separately enforced privileged authorization;
  // tenant billing status must not be treated as the source of this permission.
  if (input.context === "platform_admin") {
    return restricted("platform_admin_requires_separate_authorization");
  }

  if (input.subscriptionStatus === "cancelada") return restricted("subscription_cancelled");
  if (input.subscriptionStatus === "trial" || input.subscriptionStatus === null) {
    return restricted("no_paid_entitlement");
  }
  if (validDate(input.paidThrough) && input.paidThrough.getTime() > input.now.getTime()
      && input.subscriptionStatus === "ativa") {
    return { state: "active", operationalTools: true, aiAllowed: true,
      billingPortal: true, graceEndsAt: null, reason: "paid_entitlement" };
  }
  // Never manufacture a grace period for a tenant that never paid.
  if (!validDate(input.unpaidSince) || !validDate(input.paidThrough)) {
    return restricted("no_verified_previous_paid_period");
  }
  const graceEndsAt = new Date(input.unpaidSince.getTime() + VENDORAI_GRACE_DAYS * DAY_MS);
  if (input.now.getTime() < graceEndsAt.getTime()) {
    return { state: "grace_no_ai", operationalTools: true, aiAllowed: false,
      billingPortal: true, graceEndsAt, reason: "overdue_grace_no_ai" };
  }
  return restricted("overdue_grace_expired", graceEndsAt);
}
