import React from "react";
import { arqdorModules, handoffs, integrationRules } from "./integrationData";
import { MetricCard } from "./MetricCard";

export function IntegrationDashboard() {
  const connected = arqdorModules.filter((item) => item.status === "connected").length;
  const mocks = arqdorModules.filter((item) => item.status === "mock").length;
  const blocked = handoffs.filter((item) => item.status === "blocked").length;
  const activeRules = integrationRules.filter((item) => item.status === "active").length;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Módulos conectados" value={`${connected}/${arqdorModules.length}`} description="Módulos com integração real ou parcial." />
      <MetricCard label="Mocks restantes" value={String(mocks)} description="Módulos ainda com dados simulados." />
      <MetricCard label="Handoffs bloqueados" value={String(blocked)} description="Passagens impedindo o fluxo." />
      <MetricCard label="Regras ativas" value={String(activeRules)} description="Automações de integração." />
    </section>
  );
}
