import React from "react";

export function SystemSummaryCards({
  stats,
}: {
  stats: {
    moduleStats: { required: number; validated: number; percent: number };
    endpointStats: { required: number; green: number; percent: number };
    gatesPassed: number;
    gatesTotal: number;
    criticalMockDebt: number;
    securityFailed: number;
    rcReady: boolean;
  };
}) {
  const cards = [
    { label: "Módulos", value: `${stats.moduleStats.percent}%`, description: `${stats.moduleStats.validated}/${stats.moduleStats.required} validados` },
    { label: "Endpoints", value: `${stats.endpointStats.percent}%`, description: `${stats.endpointStats.green}/${stats.endpointStats.required} verdes` },
    { label: "Release gates", value: `${stats.gatesPassed}/${stats.gatesTotal}`, description: "Critérios de RC" },
    { label: "Mocks críticos", value: String(stats.criticalMockDebt), description: "Devem zerar antes do release" },
    { label: "RC", value: stats.rcReady ? "Pronto" : "Pendente", description: "Release Candidate" },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--arq-foreground)]">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--arq-muted)]">{card.description}</p>
        </div>
      ))}
    </section>
  );
}
