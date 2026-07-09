import React from "react";
import { aiAgents, aiInsights } from "./aiEnterpriseData";
import { AIInsightCard } from "./AIInsightCard";
import { AIKpiCard } from "./AIKpiCard";
import { AIWorkflowMap } from "./AIWorkflowMap";

export function AICommandCenter() {
  const activeAgents = aiAgents.filter((agent) => agent.status === "active").length;
  const averageConfidence = Math.round(aiAgents.reduce((sum, agent) => sum + agent.confidence, 0) / aiAgents.length);
  const warningAgents = aiAgents.filter((agent) => agent.status === "warning").length;

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AIKpiCard label="Agentes ativos" value={`${activeAgents}/${aiAgents.length}`} description="Especialistas operando no workspace." />
        <AIKpiCard label="Confiança média" value={`${averageConfidence}%`} description="Score consolidado das análises." />
        <AIKpiCard label="Alertas críticos" value={String(warningAgents)} description="Pontos que exigem decisão humana." />
        <AIKpiCard label="Ações sugeridas" value="4" description="Fila pronta para aprovação." />
      </section>

      <AIWorkflowMap />

      <section className="grid gap-5 xl:grid-cols-3">
        {aiInsights.map((insight) => (
          <AIInsightCard key={insight.id} insight={insight} />
        ))}
      </section>
    </main>
  );
}
