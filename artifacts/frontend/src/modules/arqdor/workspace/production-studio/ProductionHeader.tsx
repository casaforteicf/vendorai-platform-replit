import React from "react";
import { useProductionStudio } from "./ProductionStudioContext";

type Props = { projectTitle?: string; onBackToDocumentation?: () => void };

export function ProductionHeader({ projectTitle = "Projeto", onBackToDocumentation }: Props) {
  const { mode, setMode } = useProductionStudio();

  return (
    <header className="flex flex-col gap-4 border-b border-slate-100 bg-white px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Production Studio</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Produção e fornecedores</h1>
        <p className="mt-1 text-sm text-slate-500">{projectTitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          ["overview", "Visão"],
          ["local", "Local"],
          ["manufacturer", "Fabricante"],
          ["hybrid", "Híbrido"],
          ["quotes", "Cotações"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key as any)}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              mode === key ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            {label}
          </button>
        ))}

        <button
          type="button"
          onClick={onBackToDocumentation}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
        >
          Documentação
        </button>
      </div>
    </header>
  );
}
