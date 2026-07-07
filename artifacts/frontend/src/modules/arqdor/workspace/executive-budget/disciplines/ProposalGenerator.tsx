import React, { useMemo, useState } from "react";
import { currency, disciplineBudgets, disciplineTotal } from "./disciplineBudgetData";

export function ProposalGenerator() {
  const [clientName, setClientName] = useState("Cliente");
  const [validityDays, setValidityDays] = useState(7);
  const total = useMemo(
    () => disciplineBudgets.reduce((sum, discipline) => sum + disciplineTotal(discipline.lines), 0),
    [],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Proposta</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Gerar proposta comercial</h3>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Cliente</span>
            <input
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Validade</span>
            <input
              type="number"
              value={validityDays}
              onChange={(event) => setValidityDays(Number(event.target.value))}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </label>
        </div>

        <div className="mt-6 rounded-3xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-950">Resumo da proposta</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Proposta preparada para <strong>{clientName}</strong>, com validade de <strong>{validityDays} dias</strong> e valor previsto de{" "}
            <strong>{currency(total)}</strong>.
          </p>
        </div>

        <button
          type="button"
          className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Preparar proposta
        </button>
      </div>

      <aside className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Prévia</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Composição</h3>

        <div className="mt-5 space-y-3">
          {disciplineBudgets.map((discipline) => (
            <div key={discipline.id} className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-700">{discipline.label}</span>
              <span className="text-slate-500">{currency(disciplineTotal(discipline.lines))}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
