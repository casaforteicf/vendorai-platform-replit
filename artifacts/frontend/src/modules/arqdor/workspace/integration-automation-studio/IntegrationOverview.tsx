import React from "react";
import { automations, channels, healthChecks, providers, webhooks } from "./integrationData";
import { AutomationsPanel } from "./AutomationsPanel";
import { ChannelsPanel } from "./ChannelsPanel";
import { HealthPanel } from "./HealthPanel";
import { IntegrationMetricCard } from "./IntegrationMetricCard";

export function IntegrationOverview() {
  const connectedChannels = channels.filter((item) => item.status === "connected").length;
  const activeAutomations = automations.filter((item) => item.status === "active").length;
  const connectedProviders = providers.filter((item) => item.status === "connected").length;
  const webhookEvents = webhooks.reduce((sum, item) => sum + item.events, 0);
  const attentionServices = healthChecks.filter((item) => item.status === "attention").length;

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <IntegrationMetricCard label="Canais conectados" value={`${connectedChannels}/${channels.length}`} description="Canais de entrada e saída." />
        <IntegrationMetricCard label="Automações ativas" value={`${activeAutomations}/${automations.length}`} description="Fluxos operando." />
        <IntegrationMetricCard label="Providers conectados" value={`${connectedProviders}/${providers.length}`} description="Serviços externos." />
        <IntegrationMetricCard label="Eventos webhook" value={String(webhookEvents)} description="Eventos registrados." />
        <IntegrationMetricCard label="Serviços atenção" value={String(attentionServices)} description="Itens para estabilizar." />
      </section>

      <ChannelsPanel />
      <AutomationsPanel />
      <HealthPanel />
    </main>
  );
}
