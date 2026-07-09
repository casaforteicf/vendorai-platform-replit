import React from "react";
import { billingAccounts } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function BillingAccountsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Contas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Assinaturas, cobrança e saldo</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {billingAccounts.map((account) => (
          <article key={account.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{account.company}</p>
                <p className="mt-1 text-sm text-slate-500">ARQDOR {account.plan}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(account.status)}`}>
                {billingStatusLabel(account.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="MRR" value={account.mrr} />
              <Info label="Setup" value={account.setup} />
              <Info label="Dia cobrança" value={account.billingDay} />
              <Info label="Saldo" value={account.balance} />
            </div>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Próxima fatura</p>
              <p className="mt-1 text-sm font-semibold text-violet-900">{account.nextInvoice}</p>
              <p className="mt-1 text-xs text-violet-700">{account.paymentMethod}</p>
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
