import React from "react";
import { workflowSteps } from "./integrationData";
import { workflowStatusClass } from "./integrationUtils";

export function WorkflowEngine() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Workflow Engine</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fluxo principal ARQDOR</h2>

      <div className="mt-5 space-y-4">
        {workflowSteps.map((step, index) => (
          <div key={step.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={["flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", step.status === "completed" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"].join(" ")}>
                {step.order}
              </span>
              {index < workflowSteps.length - 1 ? <span className="mt-2 h-full min-h-[56px] w-px bg-slate-200" /> : null}
            </div>

            <div className="flex-1 rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{step.module} • {step.owner}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${workflowStatusClass(step.status)}`}>{step.status}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Info label="Entrada" value={step.input} />
                <Info label="Saída" value={step.output} />
              </div>
            </div>
          </div>
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
