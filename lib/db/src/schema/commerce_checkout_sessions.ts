import { pgTable, text, integer, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { generatedSitesTable } from "./generated_sites";
import { plansTable } from "./plans";
import { tenantsTable } from "./tenants";

export type CommerceCheckoutStatus = "created" | "payment_pending" | "paid" | "provisioning" | "provisioned" | "failed" | "cancelled";
export type CommerceRecoveryStatus = "idle" | "scheduled" | "contacted" | "recovered" | "exhausted" | "skipped";

export type CommerceAttributionSnapshot = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  pageUrl?: string | null;
  couponCode?: string | null;
  partnerCode?: string | null;
};

export type CommerceOfferSnapshot = {
  source: "landing_offer" | "plan_catalog";
  offerCode: string | null;
  planSlug: string;
  vertical: string | null;
  billingCycle: "monthly" | "annual";
  chargePriceCents: number;
  originalPriceCents: number;
  renewalPriceCents: number;
  promotionalCycles: number;
  couponsAllowed: boolean;
  partnerRulesAllowed: boolean;
  resolvedAt: string;
};

export const commerceCheckoutSessionsTable = pgTable("commerce_checkout_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("site_id").notNull().references(() => generatedSitesTable.id, { onDelete: "restrict" }),
  siteSlug: text("site_slug").notNull(),
  planId: text("plan_id").notNull().references(() => plansTable.id, { onDelete: "restrict" }),
  offerSnapshot: jsonb("offer_snapshot").$type<CommerceOfferSnapshot>().notNull(),
  attribution: jsonb("attribution").$type<CommerceAttributionSnapshot>().notNull().default({}),
  customerName: text("customer_name").notNull(),
  companyName: text("company_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  cpfCnpj: text("cpf_cnpj"),
  passwordHash: text("password_hash").notNull(),
  billingType: text("billing_type").notNull().default("UNDEFINED"),
  status: text("status").$type<CommerceCheckoutStatus>().notNull().default("created"),
  asaasCustomerId: text("asaas_customer_id"),
  asaasChargeId: text("asaas_charge_id"),
  paymentUrl: text("payment_url"),
  provisionedTenantId: text("provisioned_tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  errorCode: text("error_code"),
  paidAt: timestamp("paid_at"),
  provisionedAt: timestamp("provisioned_at"),
  recoveryStatus: text("recovery_status").$type<CommerceRecoveryStatus>().notNull().default("idle"),
  recoveryAttempts: integer("recovery_attempts").notNull().default(0),
  recoveryNextAt: timestamp("recovery_next_at"),
  recoveryLastAt: timestamp("recovery_last_at"),
  recoveryChannel: text("recovery_channel"),
  recoveryLastError: text("recovery_last_error"),
  recoveredAt: timestamp("recovered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("commerce_checkout_asaas_charge_unique").on(t.asaasChargeId),
  index("commerce_checkout_site_idx").on(t.siteId, t.createdAt),
  index("commerce_checkout_email_idx").on(t.email, t.createdAt),
  index("commerce_checkout_status_idx").on(t.status, t.createdAt),
  index("commerce_checkout_recovery_idx").on(t.recoveryStatus, t.recoveryNextAt),
]);
