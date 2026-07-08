import React from "react";

export function MetricCard({ label, value, description, trend }: { label: string; value: string; description: string; trend?: string }) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold text-slate-950">{value}</p>
        {trend ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{trend}</span> : null}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}
