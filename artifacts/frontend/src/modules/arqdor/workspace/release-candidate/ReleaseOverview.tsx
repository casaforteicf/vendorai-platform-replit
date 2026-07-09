import React from "react";
import { acceptanceGates, bugs, moduleReadiness, qaItems } from "./releaseData";
import { AcceptanceGatePanel } from "./AcceptanceGatePanel";
import { BugTriagePanel } from "./BugTriagePanel";
import { ModuleReadinessPanel } from "./ModuleReadinessPanel";
import { ReleaseMetricCard } from "./ReleaseMetricCard";

export function ReleaseOverview() {
  const average = Math.round(moduleReadiness.reduce((sum, module) => sum + module.progress, 0) / moduleReadiness.length);
  const readyModules = moduleReadiness.filter((module) => module.status === "ready").length;
  const openBugs = bugs.filter((bug) => bug.status === "open" || bug.status === "triage").length;
  const doneQa = qaItems.filter((item) => item.status === "done").length;
  const requiredGates = acceptanceGates.filter((gate) => gate.required);
  const readyGates = requiredGates.filter((gate) => gate.status === "ready").length;

  return (
    <main className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReleaseMetricCard label="Readiness geral" value={`${average}%`} description="Média consolidada dos módulos." />
        <ReleaseMetricCard label="Módulos prontos" value={`${readyModules}/${moduleReadiness.length}`} description="Áreas já em condição de RC." />
        <ReleaseMetricCard label="QA concluído" value={`${doneQa}/${qaItems.length}`} description="Validações executadas." />
        <ReleaseMetricCard label="Bugs ativos" value={String(openBugs)} description="Itens abertos ou em triagem." />
        <ReleaseMetricCard label="Gates obrigatórios" value={`${readyGates}/${requiredGates.length}`} description="Critérios essenciais aprovados." />
      </section>

      <AcceptanceGatePanel />
      <ModuleReadinessPanel />
      <BugTriagePanel />
    </main>
  );
}
