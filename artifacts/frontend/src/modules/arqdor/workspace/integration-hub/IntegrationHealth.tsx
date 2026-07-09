import React from "react";
import { arqdorModules } from "./integrationData";
import { moduleStatusClass } from "./integrationUtils";

export function IntegrationHealth() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Health Monitor</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde das integrações</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Fase</th>
              <th className="px-4 py-3">Fonte</th>
              <th className="px-4 py-3">Completo</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {arqdorModules.map((module) => (
              <tr key={module.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{module.name}</td>
                <td className="px-4 py-4 text-slate-500">{module.phase}</td>
                <td className="px-4 py-4 text-slate-500">{module.dataSource}</td>
                <td className="px-4 py-4 text-slate-500">{module.completion}%</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${moduleStatusClass(module.status)}`}>{module.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
