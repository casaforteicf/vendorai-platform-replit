import React from "react";
import { devices } from "./iotData";
import { statusClass } from "./iotUtils";

export function BuildingMap() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mapa digital</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Planta operacional do edifício</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="relative min-h-[520px] rounded-[32px] border border-dashed border-slate-200 bg-slate-50 p-6">
          <div className="absolute left-[18%] top-[18%] rounded-2xl bg-white px-4 py-3 shadow-sm">Sala</div>
          <div className="absolute right-[18%] top-[22%] rounded-2xl bg-white px-4 py-3 shadow-sm">Cozinha</div>
          <div className="absolute bottom-[22%] left-[30%] rounded-2xl bg-white px-4 py-3 shadow-sm">Suíte</div>
          <div className="absolute bottom-[18%] right-[24%] rounded-2xl bg-white px-4 py-3 shadow-sm">Técnica</div>
          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">Mapa placeholder seguro</div>
        </div>

        <aside className="space-y-3">
          {devices.map((device) => (
            <div key={device.id} className="rounded-3xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{device.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{device.location} • {device.value}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(device.status)}`}>{device.status}</span>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
