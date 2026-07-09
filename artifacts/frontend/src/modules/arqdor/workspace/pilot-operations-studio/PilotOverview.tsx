import React from "react";
import { pilotAccounts, pilotProjects, pilotTasks, riskItems, successMetrics } from "./pilotData";
import { PilotAccountsPanel } from "./PilotAccountsPanel";
import { PilotMetricCard } from "./PilotMetricCard";
import { PilotRisksPanel } from "./PilotRisksPanel";
import { PilotSuccessPanel } from "./PilotSuccessPanel";

export function PilotOverview() {
  const activeAccounts = pilotAccounts.filter((item) => item.status === "active").length;
  const activeProjects = pilotProjects.filter((item) => item.status === "active").length;
  const attentionTasks = pilotTasks.filter((item) => item.status === "attention").length;
  const highRisks = riskItems.filter((item) => item.severity === "high" || item.severity === "critical").length;
  const avgProgress = Math.round(pilotAccounts.reduce((sum, item) => sum + item.progress, 0) / pilotAccounts.length);

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <PilotMetricCard label="Contas ativas" value={`${activeAccounts}/${pilotAccounts.length}`} description="Pilotos em uso assistido." />
        <PilotMetricCard label="Projetos ativos" value={`${activeProjects}/${pilotProjects.length}`} description="Projetos em validação." />
        <PilotMetricCard label="Progresso médio" value={`${avgProgress}%`} description="Avanço consolidado dos pilotos." />
        <PilotMetricCard label="Tarefas atenção" value={String(attentionTasks)} description="Itens que exigem ação imediata." />
        <PilotMetricCard label="Riscos altos" value={String(highRisks)} description="Bloqueios potenciais." />
      </section>

      <PilotSuccessPanel />
      <PilotAccountsPanel />
      <PilotRisksPanel />
    </main>
  );
}
