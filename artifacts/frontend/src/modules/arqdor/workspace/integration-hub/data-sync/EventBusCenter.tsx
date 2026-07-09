import React from "react";
import { eventTopics } from "./dataSyncData";
import { statusClass } from "./dataSyncUtils";

export function EventBusCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Global Event Bus</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Tópicos e assinantes</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {eventTopics.map((topic) => (
          <article key={topic.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{topic.topic}</p>
                <p className="mt-1 text-sm text-slate-500">Publisher: {topic.publisher}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(topic.status)}`}>{topic.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Eventos 24h" value={String(topic.events24h)} />
              <Info label="Subscribers" value={topic.subscribers.join(", ")} />
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
