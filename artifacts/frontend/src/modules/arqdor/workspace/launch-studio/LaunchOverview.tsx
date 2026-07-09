import React from "react";
import { campaigns, demoSteps, marketSegments, offerPackages } from "./launchData";
import { CampaignBoardPanel } from "./CampaignBoardPanel";
import { DemoScriptPanel } from "./DemoScriptPanel";
import { LaunchMetricCard } from "./LaunchMetricCard";
import { OfferBuilderPanel } from "./OfferBuilderPanel";

export function LaunchOverview() {
  const readyOffers = offerPackages.filter((item) => item.status === "ready").length;
  const highPrioritySegments = marketSegments.filter((item) => item.priority === "alta").length;
  const readyDemoSteps = demoSteps.filter((item) => item.status === "ready").length;
  const readyCampaigns = campaigns.filter((item) => item.status === "ready").length;

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LaunchMetricCard label="Ofertas prontas" value={`${readyOffers}/${offerPackages.length}`} description="Pacotes comerciais para vender." />
        <LaunchMetricCard label="Segmentos prioridade" value={String(highPrioritySegments)} description="Mercados iniciais de ataque." />
        <LaunchMetricCard label="Demo pronta" value={`${readyDemoSteps}/${demoSteps.length}`} description="Etapas demonstráveis." />
        <LaunchMetricCard label="Campanhas prontas" value={`${readyCampaigns}/${campaigns.length}`} description="Ações de captação." />
      </section>

      <OfferBuilderPanel />
      <DemoScriptPanel />
      <CampaignBoardPanel />
    </main>
  );
}
