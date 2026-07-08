import React from "react";
import { approvals } from "./clientExperienceData";
import { approvalClass, currency, formatDate } from "./clientExperienceUtils";

export function ApprovalCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Aprovações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens aguardando decisão</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {approvals.map((approval) => (
          <article key={approval.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{approval.title}</p>
                <p className="mt-1 text-sm text-slate-500">{approval.type}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approvalClass(approval.status)}`}>{approval.status}</span>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">{approval.note}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Enviado" value={formatDate(approval.sentAt)} />
              <Info label="Prazo" value={formatDate(approval.dueAt)} />
              {approval.value ? <Info label="Valor" value={currency(approval.value)} /> : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-violet-700">Aprovar</button>
              <button type="button" className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">Solicitar ajuste</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
