import React from "react";
import { executiveKPIs } from "./executiveData";
import { MetricCard } from "./MetricCard";

export function KPIEngine() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {executiveKPIs.map((kpi) => (
        <MetricCard key={kpi.id} label={kpi.label} value={kpi.value} trend={kpi.trend} description={kpi.description} />
      ))}
    </section>
  );
}
