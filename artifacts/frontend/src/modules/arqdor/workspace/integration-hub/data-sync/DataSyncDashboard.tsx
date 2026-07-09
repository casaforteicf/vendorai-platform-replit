import React from "react";
import { MetricCard } from "./MetricCard";
import { apiConnectors, dataSources, syncConflicts, syncJobs } from "./dataSyncData";

export function DataSyncDashboard() {
  const realSources = dataSources.filter((source) => source.status === "connected" || source.status === "partial").length;
  const runningJobs = syncJobs.filter((job) => job.status === "running").length;
  const openConflicts = syncConflicts.filter((conflict) => conflict.status !== "resolved").length;
  const avgCoverage = Math.round(apiConnectors.reduce((sum, item) => sum + item.coverage, 0) / apiConnectors.length);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Fontes reais/parciais" value={`${realSources}/${dataSources.length}`} description="Conexões com APIs existentes." />
      <MetricCard label="Jobs rodando" value={String(runningJobs)} description="Sincronizações em andamento." />
      <MetricCard label="Conflitos abertos" value={String(openConflicts)} description="Dados divergentes entre módulos." />
      <MetricCard label="Cobertura API" value={`${avgCoverage}%`} description="Média dos conectores mapeados." />
    </section>
  );
}
