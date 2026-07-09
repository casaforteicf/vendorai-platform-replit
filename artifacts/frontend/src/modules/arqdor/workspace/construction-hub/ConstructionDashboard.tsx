import React from "react";
import { MetricCard } from "./MetricCard";
import { approvals, nonConformities, phases, photos } from "./constructionData";

export function ConstructionDashboard() {
  const avgProgress = Math.round(phases.reduce((sum, phase) => sum + phase.progress, 0) / phases.length);
  const blocked = phases.filter((phase) => phase.status === "blocked").length;
  const openNc = nonConformities.filter((item) => item.status !== "resolved").length;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Progresso físico" value={`${avgProgress}%`} description="Média das frentes de obra." />
      <MetricCard label="Fases bloqueadas" value={String(blocked)} description="Frentes impedidas." />
      <MetricCard label="Não conformidades" value={String(openNc)} description="Pendências abertas/revisão." />
      <MetricCard label="Fotos" value={String(photos.length)} description="Registros de obra." />
    </section>
  );
}
