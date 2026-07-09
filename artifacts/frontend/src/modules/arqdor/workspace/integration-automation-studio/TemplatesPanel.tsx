import React from "react";
import { templates } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel } from "./integrationUtils";

export function TemplatesPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Templates</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Modelos prontos de automação</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => (
          <article key={template.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{template.name}</p>
                <p className="mt-1 text-sm text-slate-500">{template.category}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(template.status)}`}>
                {integrationStatusLabel(template.status)}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{template.description}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {template.modules.map((module) => (
                <span key={module} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                  {module}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
