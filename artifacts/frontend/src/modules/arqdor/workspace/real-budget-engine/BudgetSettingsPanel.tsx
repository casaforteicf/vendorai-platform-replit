import React, { useEffect, useState } from "react";
import type { Budget, BudgetPayload } from "./budgetTypes";

export function BudgetSettingsPanel({
  budget,
  saving,
  onSave,
}: {
  budget?: Budget | null;
  saving?: boolean;
  onSave: (payload: Partial<BudgetPayload>) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [clientNotes, setClientNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    setTitle(budget?.title || "");
    setClientName(budget?.clientName || "");
    setDiscountType(budget?.discountType || "fixed");
    setDiscountValue(Number(budget?.discountValue || 0));
    setClientNotes(budget?.clientNotes || "");
    setInternalNotes(budget?.internalNotes || "");
  }, [budget]);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Configuração</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Dados, desconto e observações</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Título" value={title} onChange={setTitle} />
        <Field label="Cliente" value={clientName} onChange={setClientName} />

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo de desconto</span>
          <select
            value={discountType}
            onChange={(event) => setDiscountType(event.target.value as "percent" | "fixed")}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          >
            <option value="fixed">Valor fixo</option>
            <option value="percent">Percentual</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Desconto</span>
          <input
            type="number"
            value={discountValue}
            onChange={(event) => setDiscountValue(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações para cliente</span>
        <textarea
          value={clientNotes}
          onChange={(event) => setClientNotes(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações internas</span>
        <textarea
          value={internalNotes}
          onChange={(event) => setInternalNotes(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ title, clientName, discountType, discountValue, clientNotes, internalNotes })}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar orçamento"}
      </button>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}
