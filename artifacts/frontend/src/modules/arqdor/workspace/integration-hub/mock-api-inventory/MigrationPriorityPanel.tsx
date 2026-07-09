import React from "react";
import { migrationPriority } from "./mockApiInventoryData";
import { priorityClass } from "./mockApiInventoryUtils";

export function MigrationPriorityPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Prioridade de migração</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Sequência segura 019B–019J</h2>

      <div className="mt-5 space-y-4">
        {migrationPriority.map((item, index) => (
          <div key={item.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white">{item.order}</span>
              {index < migrationPriority.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1 rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{item.module}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
              </div>
              <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">Dependência: {item.dependency}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
