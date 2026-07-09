import React from "react";
import type { EndpointHealth } from "./consolidationTypes";
import { endpointLabel, healthClass } from "./consolidationUtils";

export function EndpointHealthPanel({
  endpoints,
  checking,
  onCheck,
}: {
  endpoints: EndpointHealth[];
  checking?: boolean;
  onCheck: () => void;
}) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">APIs</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Matriz de endpoints reais</h2>
        </div>

        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {checking ? "Verificando..." : "Rodar health check"}
        </button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-[var(--arq-border)]">
        <table className="min-w-[1000px] w-full text-left text-sm">
          <thead className="bg-[var(--arq-card-soft)] text-xs uppercase tracking-wide text-[var(--arq-muted)]">
            <tr>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Obrigatório</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Status HTTP</th>
              <th className="px-4 py-3">Erro</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--arq-border)]">
            {endpoints.map((endpoint) => (
              <tr key={`${endpoint.method}-${endpoint.path}-${endpoint.moduleId}`}>
                <td className="px-4 py-4 font-medium text-[var(--arq-foreground)]">{endpointLabel(endpoint)}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{endpoint.moduleId}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{endpoint.required ? "sim" : "não"}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(endpoint.health)}`}>
                    {endpoint.health}
                  </span>
                </td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{endpoint.lastStatus || "-"}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{endpoint.error || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
