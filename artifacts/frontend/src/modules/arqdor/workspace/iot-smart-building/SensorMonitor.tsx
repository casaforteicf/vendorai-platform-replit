import React from "react";
import { devices } from "./iotData";
import { statusClass } from "./iotUtils";

export function SensorMonitor() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sensor Monitor</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Sensores e leituras</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => (
          <article key={device.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{device.name}</p>
                <p className="mt-1 text-sm text-slate-500">{device.location} • {device.type}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(device.status)}`}>{device.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Leitura" value={device.value} />
              <Info label="Bateria" value={`${device.battery}%`} />
              <Info label="Atualizado" value={device.lastReading} />
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
