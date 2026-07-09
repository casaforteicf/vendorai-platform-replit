import React from "react";
import { proposals, revenueDeals, subscriptionMetrics } from "./revenueData";
import { PipelineBoardPanel } from "./PipelineBoardPanel";
import { ProposalCenterPanel } from "./ProposalCenterPanel";
import { RevenueMetricCard } from "./RevenueMetricCard";
import { SubscriptionMetricsPanel } from "./SubscriptionMetricsPanel";

export function RevenueOverview() {
  const activeDeals = revenueDeals.filter((deal) => deal.status === "active" || deal.status === "attention").length;
  const proposalsOpen = proposals.filter((proposal) => proposal.status !== "completed").length;
  const mrrPotential = subscriptionMetrics.find((item) => item.id === "sub-001")?.value || "R$ 0";
  const setupPotential = subscriptionMetrics.find((item) => item.id === "sub-002")?.value || "R$ 0";
  const avgProbability = Math.round(revenueDeals.reduce((sum, deal) => sum + deal.probability, 0) / revenueDeals.length);

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <RevenueMetricCard label="Deals ativos" value={`${activeDeals}/${revenueDeals.length}`} description="Oportunidades com movimento comercial." />
        <RevenueMetricCard label="Propostas abertas" value={String(proposalsOpen)} description="Propostas em negociação." />
        <RevenueMetricCard label="MRR potencial" value={mrrPotential} description="Receita recorrente em negociação." />
        <RevenueMetricCard label="Setup potencial" value={setupPotential} description="Receita de implantação." />
        <RevenueMetricCard label="Probabilidade média" value={`${avgProbability}%`} description="Média do pipeline atual." />
      </section>

      <SubscriptionMetricsPanel />
      <PipelineBoardPanel />
      <ProposalCenterPanel />
    </main>
  );
}
