import React from "react";
import { moduleInventory, mockRealItems, priorityTasks, releaseGates } from "./consolidationData";
import { ConsolidationMetricCard } from "./ConsolidationMetricCard";
import { MockRealPanel } from "./MockRealPanel";
import { PriorityRoadmapPanel } from "./PriorityRoadmapPanel";
import { ReleaseGatesPanel } from "./ReleaseGatesPanel";

export function ConsolidationOverview() {
  const readyFrontend = moduleInventory.filter((item) => item.frontendStatus === "ready").length;
  const realBackend = moduleInventory.filter((item) => item.backendStatus === "real").length;
  const mockCritical = mockRealItems.filter((item) => item.priority === "critica").length;
  const requiredGates = releaseGates.filter((gate) => gate.required).length;
  const readyRequiredGates = releaseGates.filter((gate) => gate.required && gate.status === "ready").length;
  const criticalTasks = priorityTasks.filter((task) => task.priority === "critica").length;

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ConsolidationMetricCard label="Frontend pronto" value={`${readyFrontend}/${moduleInventory.length}`} description="Módulos com UI enterprise criada." />
        <ConsolidationMetricCard label="Backend real" value={`${realBackend}/${moduleInventory.length}`} description="Módulos com backend real predominante." />
        <ConsolidationMetricCard label="Mocks críticos" value={String(mockCritical)} description="Áreas que bloqueiam operação real." />
        <ConsolidationMetricCard label="Gates obrigatórios" value={`${readyRequiredGates}/${requiredGates}`} description="Critérios para versão operacional." />
        <ConsolidationMetricCard label="Tarefas críticas" value={String(criticalTasks)} description="Prioridades imediatas." />
      </section>

      <PriorityRoadmapPanel />
      <MockRealPanel />
      <ReleaseGatesPanel />
    </main>
  );
}
