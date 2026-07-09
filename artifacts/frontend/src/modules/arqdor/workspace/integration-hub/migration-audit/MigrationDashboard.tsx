import React from "react";
import { MetricCard } from "./MetricCard";
import { checklist, migrations, mockInventory, traceLinks } from "./migrationData";

export function MigrationDashboard() {
  const completed = migrations.filter((item) => item.status === "completed").length;
  const blocked = migrations.filter((item) => item.status === "blocked").length;
  const criticalMocks = mockInventory.filter((item) => item.risk === "critico" || item.risk === "alto").length;
  const brokenTrace = traceLinks.filter((item) => item.status === "broken").length;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Migrações concluídas" value={`${completed}/${migrations.length}`} description="Módulos com migração validada." />
      <MetricCard label="Bloqueadas" value={String(blocked)} description="Migrações impedidas por dependência." />
      <MetricCard label="Mocks críticos" value={String(criticalMocks)} description="Mocks com alto risco operacional." />
      <MetricCard label="Trace quebrado" value={String(brokenTrace)} description="Entidades sem rastreabilidade." />
    </section>
  );
}
