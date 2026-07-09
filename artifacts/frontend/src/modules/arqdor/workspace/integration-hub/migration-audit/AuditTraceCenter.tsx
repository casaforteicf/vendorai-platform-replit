import React from "react";
import { auditTraces } from "./migrationData";
import { severityClass } from "./migrationUtils";

export function AuditTraceCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Audit Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Auditoria de migração</h2>

      <div className="mt-5 space-y-4">
        {auditTraces.map((audit, index) => (
          <div key={audit.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < auditTraces.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{audit.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(audit.severity)}`}>{audit.severity}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{audit.details}</p>
              <p className="mt-1 text-xs text-slate-400">{audit.module} • {audit.actor} • {audit.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
