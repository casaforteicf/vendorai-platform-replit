import { useMemo } from "react";
import type { ConceptWallDiagnostic } from "./conceptWallDiagnostics";
import { describeWallDiagnostics } from "./conceptWallDiagnosticPresentation";

type Props = {
  report: ConceptWallDiagnostic;
  onSelectWall: (wallId: string) => void;
};

/** Optional side-panel for editor integration. Read-only; never mutates wall geometry. */
export function ConceptWallDiagnosticsPanel({ report, onSelectWall }: Props) {
  const items = useMemo(() => describeWallDiagnostics(report), [report]);
  return (
    <section aria-label="Diagnóstico de paredes" className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-100">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Diagnóstico de paredes</h3>
        <span className={report.hasBlockingIssues ? "text-amber-400" : "text-emerald-400"}>
          {report.hasBlockingIssues ? "Revisão necessária" : "Sem erros detectados"}
        </span>
      </header>
      {items.length === 0 ? <p className="text-zinc-400">Nenhum conflito identificado.</p> : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-zinc-700 p-2">
              <div className={item.severity === "error" ? "text-amber-300" : "text-zinc-300"}>{item.label}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {item.wallIds.map((wallId, index) => (
                  <button key={`${wallId}-${index}`} type="button"
                    onClick={() => onSelectWall(wallId)}
                    className="rounded bg-zinc-800 px-2 py-1 text-emerald-300 hover:bg-zinc-700"
                    aria-label={`Selecionar parede ${wallId}`}>
                    Parede {wallId}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-zinc-500">Inspeção somente leitura. Ajustes precisam ser confirmados no editor.</p>
    </section>
  );
}
