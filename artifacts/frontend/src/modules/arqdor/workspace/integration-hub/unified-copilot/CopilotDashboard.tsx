import React from "react";
import { MetricCard } from "./MetricCard";
import { copilotActions, copilotAgents, contextItems, healthChecks } from "./copilotData";

export function CopilotDashboard() {
  const onlineAgents = copilotAgents.filter((agent) => agent.status === "online").length;
  const pendingActions = copilotActions.filter((action) => action.status === "suggested" || action.status === "approved").length;
  const warnings = healthChecks.filter((check) => check.status === "warning" || check.status === "critical").length;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Agentes online" value={`${onlineAgents}/${copilotAgents.length}`} description="Agentes disponíveis para execução." />
      <MetricCard label="Contextos ativos" value={String(contextItems.length)} description="Entidades carregadas no Copilot." />
      <MetricCard label="Ações pendentes" value={String(pendingActions)} description="Sugestões aguardando decisão." />
      <MetricCard label="Health warnings" value={String(warnings)} description="Serviços exigindo atenção." />
    </section>
  );
}
