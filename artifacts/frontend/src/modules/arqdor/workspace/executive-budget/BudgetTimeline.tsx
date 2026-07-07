import React from "react";

const events = [
  { title: "Orçamento iniciado", description: "Itens base gerados a partir das disciplinas.", date: "Agora" },
  { title: "Revisão técnica", description: "Validar quantitativos e custos por disciplina.", date: "Próxima ação" },
  { title: "Proposta comercial", description: "Preparar versão final para envio ao cliente.", date: "Pendente" },
];

export function BudgetTimeline() {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Timeline</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Evolução do orçamento</h3>

      <div className="mt-5 space-y-4">
        {events.map((event, index) => (
          <div key={event.title} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < events.length - 1 ? <span className="mt-2 h-full min-h-[44px] w-px bg-slate-200" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">{event.title}</p>
              <p className="mt-1 text-sm text-slate-500">{event.description}</p>
              <p className="mt-1 text-xs text-slate-400">{event.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
