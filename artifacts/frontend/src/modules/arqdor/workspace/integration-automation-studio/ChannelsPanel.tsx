import React from "react";
import { channels } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel } from "./integrationUtils";

export function ChannelsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Canais</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Canais de comunicação e entrada de dados</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {channels.map((channel) => (
          <article key={channel.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{channel.name}</p>
                <p className="mt-1 text-sm text-slate-500">{channel.provider}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(channel.status)}`}>
                {integrationStatusLabel(channel.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Uso</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{channel.useCase}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Próxima ação</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{channel.nextAction}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
