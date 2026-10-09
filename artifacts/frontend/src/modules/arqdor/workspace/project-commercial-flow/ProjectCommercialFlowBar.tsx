import React from "react";
import type { CommercialFlowStage } from "./commercialFlowHandoff";

type Props = {
  current: CommercialFlowStage;
  onNavigate?: (module: string) => void;
  projectReady?: boolean;
  specificationReady?: boolean;
  budgetReady?: boolean;
};

const steps: Array<{ id: CommercialFlowStage; label: string; module: string }> = [
  { id: "render", label: "1. Projeto", module: "projeto" },
  { id: "specification", label: "2. Especificar (opcional)", module: "real-specification" },
  { id: "budget", label: "3. Quantificar / Orçar", module: "real-budget" },
];

export function ProjectCommercialFlowBar({
  current,
  onNavigate,
  projectReady = true,
  specificationReady = false,
  budgetReady = false,
}: Props) {
  const stateFor = (id: CommercialFlowStage) => {
    if (id === "render") return projectReady;
    if (id === "specification") return specificationReady;
    return budgetReady;
  };

  return (
    <nav
      aria-label="Fluxo comercial do projeto"
      className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] p-2 shadow-sm"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const active = step.id === current;
          const ready = stateFor(step.id);
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onNavigate?.(step.module)}
              className={[
                "flex items-center justify-between rounded-xl px-4 py-3 text-left transition",
                active
                  ? "bg-slate-950 text-white"
                  : "bg-[var(--arq-card-soft)] text-[var(--arq-foreground)] hover:ring-1 hover:ring-violet-200",
              ].join(" ")}
            >
              <span className="text-sm font-semibold">{step.label}</span>
              <span className={active ? "text-xs text-white/70" : ready ? "text-xs text-emerald-600" : "text-xs text-amber-600"}>
                {active ? "Agora" : ready ? "Pronto" : "Pendente"}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
