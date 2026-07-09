import React from "react";
import type { ArqdorModule } from "./consolidationTypes";
import { healthClass } from "./consolidationUtils";

export function ModuleRegistryPanel({
  modules,
  onNavigate,
}: {
  modules: ArqdorModule[];
  onNavigate?: (routeKey: string) => void;
}) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Registro</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Módulos ARQDOR 029–034</h2>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-[var(--arq-border)]">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-[var(--arq-card-soft)] text-xs uppercase tracking-wide text-[var(--arq-muted)]">
            <tr>
              <th className="px-4 py-3">Sprint</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Componente</th>
              <th className="px-4 py-3">Rotas</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Ação</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--arq-border)]">
            {modules.map((module) => (
              <tr key={module.id}>
                <td className="px-4 py-4 font-semibold text-[var(--arq-foreground)]">{module.sprint}</td>
                <td className="px-4 py-4">
                  <p className="font-medium text-[var(--arq-foreground)]">{module.label}</p>
                  <p className="mt-1 text-xs text-[var(--arq-muted)]">{module.description}</p>
                </td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{module.componentName}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{module.routeKeys.join(", ")}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{module.status}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(module.health)}`}>
                    {module.health}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    onClick={() => onNavigate?.(module.routeKeys[0])}
                    className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white"
                  >
                    abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
