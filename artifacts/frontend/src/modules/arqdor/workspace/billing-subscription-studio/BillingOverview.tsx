import React from "react";
import { billingAccounts, invoices, usageMetrics } from "./billingData";
import { BillingAccountsPanel } from "./BillingAccountsPanel";
import { BillingMetricCard } from "./BillingMetricCard";
import { InvoicesPanel } from "./InvoicesPanel";
import { UsageMeteringPanel } from "./UsageMeteringPanel";

export function BillingOverview() {
  const activeAccounts = billingAccounts.filter((account) => account.status === "active").length;
  const openInvoices = invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "overdue").length;
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid").length;
  const totalRenders = usageMetrics.reduce((sum, item) => sum + item.renders, 0);

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <BillingMetricCard label="Contas ativas" value={`${activeAccounts}/${billingAccounts.length}`} description="Clientes com cobrança ativa." />
        <BillingMetricCard label="Faturas abertas" value={String(openInvoices)} description="Emitidas ou vencidas." />
        <BillingMetricCard label="Faturas pagas" value={String(paidInvoices)} description="Recebimentos confirmados." />
        <BillingMetricCard label="Renders usados" value={String(totalRenders)} description="Uso total no ciclo atual." />
        <BillingMetricCard label="Receita base" value="R$ 8.491" description="MRR + setups em operação." />
      </section>

      <BillingAccountsPanel />
      <InvoicesPanel />
      <UsageMeteringPanel />
    </main>
  );
}
