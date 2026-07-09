import React from "react";
import type { ArqdorModule, NavigationFlowStep } from "./consolidationTypes";
import { healthClass } from "./consolidationUtils";

export function NavigationFlowPanel({
  flow,
  modules,
  onNavigate,
}: {
  flow: NavigationFlowStep[];
  modules: ArqdorModule[];
  onNavigate?: (routeKey: string) => void;
}) {
  const moduleMap = new Map(modules.map((module) => [module.id, module]));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Navegação</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fluxo principal unificado</h2>

      <div className="mt-5 grid gap-4 xl:grid-cols-7">
        {flow.map((step, index) => {
          const module = moduleMap.get(step.moduleId);

          return (
            <div key={step.id} className="relative">
              {index > 0 ? (
                <div className="absolute -left-2 top-12 hidden h-px w-4 bg-slate-200 xl:block" />
              ) : null}

              <button
                type="button"
                onClick={() => onNavigate?.(step.routeKey)}
                className="h-full w-full rounded-[26px] border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
              >
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-4 text-sm font-semibold text-slate-950">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{module?.description || "-"}</p>
                {module ? (
                  <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${healthClass(module.health)}`}>
                    {module.health}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
