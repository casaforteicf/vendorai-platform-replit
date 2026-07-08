import React from "react";
import { timelineSteps } from "./specificationData";
import type { SpecObject } from "./specificationTypes";
import { statusIndex } from "./specificationUtils";

export function SpecificationTimeline({ selectedObject }: { selectedObject: SpecObject }) {
  const current = statusIndex(selectedObject.status);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Timeline executiva</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedObject.name}</h2>

      <div className="mt-8 grid gap-4 md:grid-cols-7">
        {timelineSteps.map((step, index) => (
          <div key={step} className="text-center">
            <div className={["mx-auto flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold", index <= current ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400"].join(" ")}>
              {index + 1}
            </div>
            <p className={["mt-3 text-sm font-semibold", index <= current ? "text-slate-900" : "text-slate-400"].join(" ")}>{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
