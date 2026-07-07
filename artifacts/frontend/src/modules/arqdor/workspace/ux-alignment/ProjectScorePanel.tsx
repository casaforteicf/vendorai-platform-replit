import React from "react";
import { projectScores } from "./uxAlignmentData";

const color: Record<string, string> = {
  ok: "bg-emerald-500",
  attention: "bg-amber-500",
  critical: "bg-rose-500",
};

export function ProjectScorePanel() {
  const total = Math.round(projectScores.reduce((sum, item) => sum + item.value, 0) / projectScores.length);

  return (
    <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">AI Score</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Saúde do projeto</h3>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-2 text-xl font-semibold text-white">{total}%</div>
      </div>

      <div className="mt-5 space-y-3">
        {projectScores.map((score) => (
          <div key={score.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-700">{score.label}</span>
              <span className="text-slate-500">{score.value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${color[score.status]}`} style={{ width: `${score.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
