import React from "react";
import { storyTimeline } from "./uxAlignmentData";

export function ProjectStoryTimeline() {
  return (
    <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">História do projeto</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Evolução das decisões</h3>
      </div>

      <div className="space-y-4">
        {storyTimeline.map((item, index) => (
          <div key={item.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < storyTimeline.length - 1 ? <span className="mt-2 h-full min-h-[42px] w-px bg-slate-200" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
