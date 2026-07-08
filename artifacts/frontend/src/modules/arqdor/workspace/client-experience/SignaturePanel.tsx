import React, { useState } from "react";

export function SignaturePanel() {
  const [accepted, setAccepted] = useState(false);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Assinatura</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Aceite digital</h2>

      <div className="mt-5 rounded-3xl bg-slate-50 p-5">
        <p className="text-sm leading-6 text-slate-600">
          Confirmo que revisei os renders, especificações, orçamento e próximos passos do projeto.
        </p>
      </div>

      <label className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Aceito aprovar digitalmente esta etapa.
      </label>

      <button
        type="button"
        disabled={!accepted}
        className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Assinar digitalmente
      </button>
    </section>
  );
}
