import React from "react";
import { MetricCard } from "./MetricCard";
import { apiInventory, contracts, mockFiles, risks } from "./mockApiInventoryData";

export function InventoryDashboard() {
  const replaceNext = mockFiles.filter((item) => item.status === "replace_next").length;
  const readyApis = apiInventory.filter((item) => item.status === "ready" || item.status === "partial").length;
  const missingContracts = contracts.filter((item) => item.status === "missing").length;
  const criticalRisks = risks.filter((item) => item.risk === "critica" || item.risk === "alta").length;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Mocks prioritários" value={String(replaceNext)} description="Arquivos marcados para troca." />
      <MetricCard label="APIs disponíveis/parciais" value={`${readyApis}/${apiInventory.length}`} description="Endpoints prontos para integração." />
      <MetricCard label="Contratos ausentes" value={String(missingContracts)} description="IDs canônicos pendentes." />
      <MetricCard label="Riscos altos" value={String(criticalRisks)} description="Riscos altos/críticos." />
    </section>
  );
}
