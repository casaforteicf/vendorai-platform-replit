export type BillingView =
  | "overview"
  | "plans"
  | "accounts"
  | "invoices"
  | "payments"
  | "usage"
  | "commissions"
  | "contracts"
  | "dunning"
  | "recognition";

export type BillingStatus = "active" | "attention" | "blocked" | "completed" | "pending";
export type PlanTier = "Start" | "Pro" | "Enterprise" | "Marketplace";
export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled";

export type BillingPlan = {
  id: string;
  name: PlanTier;
  monthly: string;
  setup: string;
  target: string;
  limits: string[];
  status: BillingStatus;
};

export type BillingAccount = {
  id: string;
  company: string;
  plan: PlanTier;
  mrr: string;
  setup: string;
  billingDay: string;
  paymentMethod: string;
  status: BillingStatus;
  balance: string;
  nextInvoice: string;
};

export type InvoiceItem = {
  id: string;
  company: string;
  number: string;
  amount: string;
  dueDate: string;
  status: InvoiceStatus;
  description: string;
};

export type PaymentItem = {
  id: string;
  company: string;
  method: string;
  amount: string;
  date: string;
  status: BillingStatus;
  notes: string;
};

export type UsageMetric = {
  id: string;
  company: string;
  renders: number;
  storage: string;
  aiActions: number;
  users: number;
  limit: string;
  status: BillingStatus;
};

export type CommissionItem = {
  id: string;
  partner: string;
  source: string;
  base: string;
  rate: string;
  amount: string;
  status: BillingStatus;
};

export type ContractItem = {
  id: string;
  company: string;
  plan: PlanTier;
  start: string;
  renewal: string;
  term: string;
  status: BillingStatus;
  notes: string;
};

export type DunningItem = {
  id: string;
  company: string;
  invoice: string;
  daysOverdue: number;
  amount: string;
  action: string;
  status: BillingStatus;
};

export type RecognitionItem = {
  id: string;
  month: string;
  mrrRecognized: string;
  setupRecognized: string;
  deferred: string;
  status: BillingStatus;
};
