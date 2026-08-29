import { boolean, integer, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const accessLicensesTable = pgTable("access_licenses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  mode: text("mode").$type<"prepaid" | "annual" | "legacy">().notNull().default("prepaid"),
  status: text("status").$type<"active" | "read_only" | "pending_contract" | "cancelled">().notNull().default("read_only"),
  accessEndsAt: timestamp("access_ends_at"),
  freeBenefitMonth: text("free_benefit_month"),
  freeActivatedAt: timestamp("free_activated_at"),
  freeEndsAt: timestamp("free_ends_at"),
  annualStartsAt: timestamp("annual_starts_at"),
  annualEndsAt: timestamp("annual_ends_at"),
  annualContractId: text("annual_contract_id"),
  reminderStage: integer("reminder_stage").notNull().default(0),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("access_licenses_tenant_unique").on(t.tenantId)]);

export const accessPassPurchasesTable = pgTable("access_pass_purchases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  days: integer("days").notNull().default(5),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("399.00"),
  status: text("status").$type<"pending" | "paid" | "cancelled" | "refunded" | "chargeback">().notNull().default("pending"),
  provider: text("provider").notNull().default("asaas"),
  providerChargeId: text("provider_charge_id"),
  providerCustomerId: text("provider_customer_id"),
  invoiceUrl: text("invoice_url"),
  idempotencyKey: text("idempotency_key"),
  paidAt: timestamp("paid_at"),
  accessStartsAt: timestamp("access_starts_at"),
  accessEndsAt: timestamp("access_ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("access_pass_purchases_idempotency_unique").on(t.tenantId, t.idempotencyKey)]);

export const accessContractAcceptancesTable = pgTable("access_contract_acceptances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  responsibleName: text("responsible_name").notNull(),
  responsibleCpf: text("responsible_cpf").notNull(),
  responsibleRole: text("responsible_role").notNull(),
  responsibleEmail: text("responsible_email").notNull(),
  termsVersion: text("terms_version").notNull(),
  termsHash: text("terms_hash").notNull(),
  accepted: boolean("accepted").notNull().default(false),
  acceptedAt: timestamp("accepted_at"),
  acceptedIp: text("accepted_ip"),
  acceptedUserAgent: text("accepted_user_agent"),
  monthlyAmount: numeric("monthly_amount", { precision: 10, scale: 2 }),
  commitmentMonths: integer("commitment_months").notNull().default(12),
  status: text("status").$type<"pending_payment" | "active" | "cancelled">().notNull().default("pending_payment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AccessLicense = typeof accessLicensesTable.$inferSelect;
export type AccessPassPurchase = typeof accessPassPurchasesTable.$inferSelect;
