import React from "react";
import { systemHealth } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel } from "./tenantAdminUtils";

export function SystemHealthPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">System health</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde operacional dos serviços ARQDOR</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {systemHealth.map((service) => (
          <article key={service.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{service.service}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(service.status)}`}>
                {adminStatusLabel(service.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Uptime" value={service.uptime} />
              <Info label="Latência" value={service.latency} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{service.notes}</p>
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
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
