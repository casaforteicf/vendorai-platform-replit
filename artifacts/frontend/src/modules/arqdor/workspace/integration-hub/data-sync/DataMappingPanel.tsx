import React from "react";
import { dataMappings } from "./dataSyncData";
import { percent, statusClass } from "./dataSyncUtils";

export function DataMappingPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Data Mapping</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Mapeamentos entre módulos</h2>

      <div className="mt-6 space-y-5">
        {dataMappings.map((mapping) => {
          const progress = percent(mapping.fieldsMapped, mapping.fieldsTotal);
          return (
            <div key={mapping.id} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{mapping.from} → {mapping.to}</p>
                  <p className="mt-1 text-xs text-slate-500">{mapping.entity}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(mapping.status)}`}>{mapping.status}</span>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-600">Campos mapeados</span>
                  <span className="text-slate-400">{mapping.fieldsMapped}/{mapping.fieldsTotal}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
