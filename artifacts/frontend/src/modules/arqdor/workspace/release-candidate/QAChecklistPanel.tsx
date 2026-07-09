import React from "react";
import { qaItems } from "./releaseData";
import { checklistStatusClass, checklistStatusLabel } from "./releaseUtils";

export function QAChecklistPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">QA</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Checklist de validação do Release Candidate</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Área</th>
              <th className="px-4 py-3">Validação</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Evidência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {qaItems.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{item.area}</td>
                <td className="px-4 py-4 text-slate-600">{item.title}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${checklistStatusClass(item.status)}`}>
                    {checklistStatusLabel(item.status)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{item.owner}</td>
                <td className="px-4 py-4 text-slate-500">{item.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
