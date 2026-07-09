import React from "react";
import { syncLogs } from "./dataSyncData";
import { statusClass } from "./dataSyncUtils";

export function SyncLogPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sync Logs</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Logs de sincronização</h2>

      <div className="mt-5 space-y-4">
        {syncLogs.map((log, index) => (
          <div key={log.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < syncLogs.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{log.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(log.status)}`}>{log.status}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{log.detail}</p>
              <p className="mt-1 text-xs text-slate-400">{log.module} • {log.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
