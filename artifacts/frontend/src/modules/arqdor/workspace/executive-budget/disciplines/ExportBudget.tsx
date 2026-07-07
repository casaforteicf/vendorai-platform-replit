import React from "react";

export function ExportBudget() {
  const actions = [
    "Gerar PDF executivo",
    "Gerar Excel",
    "Enviar para cliente",
    "Salvar no projeto",
    "Anexar à proposta",
  ];

  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Exportação</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Saídas do orçamento</h3>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
