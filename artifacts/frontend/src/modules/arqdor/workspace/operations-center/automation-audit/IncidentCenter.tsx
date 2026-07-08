import React from "react";
import { incidents } from "./automationAuditData";
import { severityClass } from "./automationAuditUtils";

export function IncidentCenter() {
  const statusClass = {
    open: "bg-amber-50 text-amber-700",
    investigating: "bg-violet-50 text-violet-700",
    resolved: "bg-emerald-50 text-emerald-700",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Incident Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Incidentes operacionais</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {incidents.map((incident) => (
          <article key={incident.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{incident.title}</p>
                <p className="mt-1 text-sm text-slate-500">{incident.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(incident.severity)}`}>{incident.severity}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Status" value={incident.status} />
              <Info label="Dono" value={incident.owner} />
              <Info label="Criado" value={incident.createdAt} />
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
