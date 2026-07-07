import React from "react";

type DesignHeaderProps = {
  projectTitle?: string;
  environmentName?: string;
  versionLabel?: string;
  onNextStep?: () => void;
};

export function DesignHeader({
  projectTitle = "Projeto",
  environmentName = "Ambiente",
  versionLabel = "Versão atual",
  onNextStep,
}: DesignHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-100 bg-white px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="truncate">{projectTitle}</span>
          <span>/</span>
          <span className="truncate font-medium text-slate-800">{environmentName}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{versionLabel}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
        >
          Comparar
        </button>
        <button
          type="button"
          onClick={onNextStep}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          ✨ Próxima etapa
        </button>
      </div>
    </header>
  );
}
