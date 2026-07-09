import React from "react";
import { invoices } from "./billingData";
import { invoiceStatusClass, invoiceStatusLabel } from "./billingUtils";

export function InvoicesPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Faturas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Emissão, vencimento e status</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Descrição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{invoice.number}</td>
                <td className="px-4 py-4 text-slate-500">{invoice.company}</td>
                <td className="px-4 py-4 text-slate-500">{invoice.amount}</td>
                <td className="px-4 py-4 text-slate-500">{invoice.dueDate}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoiceStatusClass(invoice.status)}`}>
                    {invoiceStatusLabel(invoice.status)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{invoice.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
