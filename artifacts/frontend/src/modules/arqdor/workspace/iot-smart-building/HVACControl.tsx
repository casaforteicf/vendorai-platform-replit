import React from "react";
import { hvacZones } from "./iotData";
import { statusClass } from "./iotUtils";

export function HVACControl() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">HVAC</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Climatização por zona</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {hvacZones.map((zone) => (
          <article key={zone.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{zone.zone}</p>
                <p className="mt-1 text-sm text-slate-500">Modo {zone.mode}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(zone.status)}`}>{zone.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Temperatura" value={`${zone.temperature}°C`} />
              <Info label="Umidade" value={`${zone.humidity}%`} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {["Auto", "Eco", "Off", "Manutenção"].map((action, index) => (
                <button key={action} type="button" className={[
                  "rounded-2xl px-3 py-3 text-xs font-semibold transition",
                  index === 1 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
                ].join(" ")}>
                  {action}
                </button>
              ))}
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
