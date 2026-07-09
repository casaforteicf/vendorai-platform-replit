import React from "react";
import { devices } from "./iotData";

export function EnvironmentMonitor() {
  const environmentDevices = devices.filter((device) => ["temperature", "humidity", "air_quality", "occupancy"].includes(device.type));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Ambiente</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Temperatura, umidade e qualidade do ar</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {environmentDevices.map((device) => (
          <article key={device.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{device.name}</p>
            <p className="mt-1 text-sm text-slate-500">{device.location}</p>
            <p className="mt-5 text-3xl font-semibold text-slate-950">{device.value}</p>
            <p className="mt-1 text-xs text-slate-400">Atualizado: {device.lastReading}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
