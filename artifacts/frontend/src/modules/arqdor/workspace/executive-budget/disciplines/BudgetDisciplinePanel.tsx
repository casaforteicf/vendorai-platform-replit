import React, { useState } from "react";
import { DisciplineBudgetTable } from "./DisciplineBudgetTable";
import { disciplineBudgets } from "./disciplineBudgetData";

export function BudgetDisciplinePanel() {
  const [activeId, setActiveId] = useState(disciplineBudgets[0]?.id || "marcenaria");
  const active = disciplineBudgets.find((item) => item.id === activeId) || disciplineBudgets[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-violet-600">Disciplinas</p>
        <div className="space-y-1">
          {disciplineBudgets.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={[
                "w-full rounded-2xl px-3 py-3 text-left text-sm font-semibold transition",
                activeId === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <DisciplineBudgetTable config={active} />
    </div>
  );
}
