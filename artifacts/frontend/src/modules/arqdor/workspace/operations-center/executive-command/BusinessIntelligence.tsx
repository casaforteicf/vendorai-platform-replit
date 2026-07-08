import React from "react";
import { capacityItems, portfolioProjects } from "./executiveData";
import { currency } from "./executiveUtils";

export function BusinessIntelligence() {
  const totalBudget = portfolioProjects.reduce((sum, project) => sum + project.budget, 0);
  const avgMargin = Math.round(portfolioProjects.reduce((sum, project) => sum + project.margin, 0) / portfolioProjects.length);
  const avgCapacity = Math.round(capacityItems.reduce((sum, item) => sum + item.allocated, 0) / capacityItems.length);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Business Intelligence</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Visão consolidada</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Card title="Budget em portfólio" value={currency(totalBudget)} description="Soma dos projetos ativos." />
        <Card title="Margem média" value={`${avgMargin}%`} description="Margem média por projeto." />
        <Card title="Capacidade média" value={`${avgCapacity}%`} description="Alocação operacional." />
      </div>
    </section>
  );
}

function Card({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <article className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </article>
  );
}
