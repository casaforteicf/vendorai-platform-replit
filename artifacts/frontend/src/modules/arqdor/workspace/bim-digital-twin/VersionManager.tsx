import React from "react";
import { versions } from "./bimData";
import { statusClass } from "./bimUtils";

export function VersionManager() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Versionamento</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Histórico BIM</h2>

      <div className="mt-5 space-y-4">
        {versions.map((version, index) => (
          <div key={version.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={["h-3 w-3 rounded-full", version.status === "current" ? "bg-violet-600" : "bg-slate-200"].join(" ")} />
              {index < versions.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{version.name} — {version.version}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(version.status)}`}>{version.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{version.changes} alterações • {version.author} • {version.date}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
